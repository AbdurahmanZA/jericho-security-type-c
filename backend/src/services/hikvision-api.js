/**
 * Hikvision ISAPI Integration Service
 * Handles authentication using AK/SK and provides camera management
 */

import crypto from 'crypto';
import axios from 'axios';
import { URLSearchParams } from 'url';

export class HikvisionAPI {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
    this.apiUrl = config.apiUrl;
    this.timeout = config.timeout || 30000;
    this.httpClient = null;
    this.deviceCache = new Map();
    this.tokenCache = new Map();
  }

  /**
   * Initialize the Hikvision API service
   */
  async initialize() {
    if (!this.accessKey || !this.secretKey) {
      throw new Error('Hikvision Access Key and Secret Key are required');
    }

    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'JERICHO-Security-TypeC/2.0.0',
      },
    });

    // Add request interceptor for authentication
    this.httpClient.interceptors.request.use(
      (config) => this.addAuthenticationHeaders(config),
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => this.handleAPIError(error)
    );

    this.logger.info('✅ Hikvision API service initialized successfully');
  }

  /**
   * Generate authentication signature for Hikvision ISAPI
   */
  generateSignature(method, uri, params = {}, timestamp) {
    const sortedParams = new URLSearchParams();
    
    // Add standard parameters
    sortedParams.append('ak', this.accessKey);
    sortedParams.append('timestamp', timestamp);
    
    // Add custom parameters
    Object.keys(params)
      .sort()
      .forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
          sortedParams.append(key, params[key]);
        }
      });

    const canonicalQueryString = sortedParams.toString();
    const stringToSign = `${method}\n${uri}\n${canonicalQueryString}`;
    
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(stringToSign, 'utf8')
      .digest('base64');

    return signature;
  }

  /**
   * Add authentication headers to requests
   */
  addAuthenticationHeaders(config) {
    const timestamp = Math.floor(Date.now() / 1000);
    const method = config.method.toUpperCase();
    const uri = new URL(config.url, this.apiUrl).pathname;
    
    let params = {};
    if (config.params) {
      params = { ...config.params };
    }
    if (config.data && typeof config.data === 'object') {
      params = { ...params, ...config.data };
    }

    const signature = this.generateSignature(method, uri, params, timestamp);

    config.headers = {
      ...config.headers,
      'X-HV-AK': this.accessKey,
      'X-HV-Timestamp': timestamp,
      'X-HV-Signature': signature,
    };

    return config;
  }

  /**
   * Handle API errors with proper logging
   */
  handleAPIError(error) {
    if (error.response) {
      const { status, data } = error.response;
      this.logger.error(`Hikvision API Error [${status}]:`, data);
      
      switch (status) {
        case 401:
          throw new Error('Hikvision API authentication failed. Check your AK/SK credentials.');
        case 403:
          throw new Error('Hikvision API access forbidden. Check your permissions.');
        case 404:
          throw new Error('Hikvision API endpoint not found.');
        case 429:
          throw new Error('Hikvision API rate limit exceeded. Please try again later.');
        case 500:
          throw new Error('Hikvision API internal server error.');
        default:
          throw new Error(`Hikvision API error: ${data.message || 'Unknown error'}`);
      }
    } else if (error.request) {
      this.logger.error('Hikvision API Network Error:', error.message);
      throw new Error('Failed to connect to Hikvision API. Check your network connection.');
    } else {
      this.logger.error('Hikvision API Error:', error.message);
      throw new Error(`Hikvision API error: ${error.message}`);
    }
  }

  /**
   * Get list of all devices from Hikvision platform
   */
  async getDevices(page = 1, pageSize = 100) {
    try {
      const cacheKey = `devices_${page}_${pageSize}`;
      
      // Check cache first
      if (this.deviceCache.has(cacheKey)) {
        const cached = this.deviceCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 minutes cache
          return cached.data;
        }
      }

      const response = await this.httpClient.get('/api/resource/v1/cameras', {
        params: {
          pageNo: page,
          pageSize: pageSize,
        },
      });

      const devices = response.data;
      
      // Cache the result
      this.deviceCache.set(cacheKey, {
        data: devices,
        timestamp: Date.now(),
      });

      this.logger.info(`📱 Retrieved ${devices.data?.length || 0} devices from Hikvision platform`);
      return devices;

    } catch (error) {
      this.logger.error('Failed to get devices from Hikvision:', error.message);
      throw error;
    }
  }

  /**
   * Get device details by device ID
   */
  async getDeviceDetails(deviceId) {
    try {
      const cacheKey = `device_${deviceId}`;
      
      if (this.deviceCache.has(cacheKey)) {
        const cached = this.deviceCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 10 * 60 * 1000) { // 10 minutes cache
          return cached.data;
        }
      }

      const response = await this.httpClient.get(`/api/resource/v1/cameras/${deviceId}`);
      const device = response.data;
      
      // Cache the result
      this.deviceCache.set(cacheKey, {
        data: device,
        timestamp: Date.now(),
      });

      return device;

    } catch (error) {
      this.logger.error(`Failed to get device details for ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get live stream URL for a device
   */
  async getLiveStreamUrl(deviceId, streamType = 'main') {
    try {
      const response = await this.httpClient.post(`/api/video/v1/cameras/${deviceId}/liveUrls`, {
        streamType: streamType, // main, sub
        protocol: 'rtsp',
        transmode: 1, // UDP: 1, TCP: 2
      });

      const streamData = response.data;
      
      if (streamData.code === 0 && streamData.data?.url) {
        this.logger.info(`📺 Generated live stream URL for device ${deviceId}`);
        return streamData.data.url;
      } else {
        throw new Error(`Failed to get stream URL: ${streamData.message}`);
      }

    } catch (error) {
      this.logger.error(`Failed to get live stream URL for ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get playback stream URL for a device
   */
  async getPlaybackStreamUrl(deviceId, startTime, endTime, streamType = 'main') {
    try {
      const response = await this.httpClient.post(`/api/video/v1/cameras/${deviceId}/playbackUrls`, {
        streamType: streamType,
        protocol: 'rtsp',
        transmode: 1,
        startTime: startTime, // ISO 8601 format
        endTime: endTime,
      });

      const streamData = response.data;
      
      if (streamData.code === 0 && streamData.data?.url) {
        this.logger.info(`📹 Generated playback stream URL for device ${deviceId}`);
        return streamData.data.url;
      } else {
        throw new Error(`Failed to get playback URL: ${streamData.message}`);
      }

    } catch (error) {
      this.logger.error(`Failed to get playback stream URL for ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Capture snapshot from a device
   */
  async captureSnapshot(deviceId) {
    try {
      const response = await this.httpClient.post(`/api/video/v1/cameras/${deviceId}/picture`, {
        pictureType: 1, // Real-time picture
      });

      const pictureData = response.data;
      
      if (pictureData.code === 0 && pictureData.data?.picUrl) {
        this.logger.info(`📸 Captured snapshot for device ${deviceId}`);
        return pictureData.data.picUrl;
      } else {
        throw new Error(`Failed to capture snapshot: ${pictureData.message}`);
      }

    } catch (error) {
      this.logger.error(`Failed to capture snapshot for ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Enable/disable motion detection for a device
   */
  async setMotionDetection(deviceId, enabled, sensitivity = 'medium') {
    try {
      const response = await this.httpClient.put(`/api/event/v1/cameras/${deviceId}/motionDetection`, {
        enabled: enabled,
        sensitivity: sensitivity, // low, medium, high
      });

      const result = response.data;
      
      if (result.code === 0) {
        this.logger.info(`🔍 Motion detection ${enabled ? 'enabled' : 'disabled'} for device ${deviceId}`);
        return true;
      } else {
        throw new Error(`Failed to set motion detection: ${result.message}`);
      }

    } catch (error) {
      this.logger.error(`Failed to set motion detection for ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get motion detection events for a device
   */
  async getMotionEvents(deviceId, startTime, endTime, page = 1, pageSize = 100) {
    try {
      const response = await this.httpClient.get(`/api/event/v1/cameras/${deviceId}/events`, {
        params: {
          eventType: 'motionDetection',
          startTime: startTime,
          endTime: endTime,
          pageNo: page,
          pageSize: pageSize,
        },
      });

      const events = response.data;
      
      if (events.code === 0) {
        this.logger.info(`📋 Retrieved ${events.data?.total || 0} motion events for device ${deviceId}`);
        return events.data;
      } else {
        throw new Error(`Failed to get motion events: ${events.message}`);
      }

    } catch (error) {
      this.logger.error(`Failed to get motion events for ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * PTZ control for a device (if supported)
   */
  async ptzControl(deviceId, action, params = {}) {
    try {
      const response = await this.httpClient.post(`/api/ptz/v1/cameras/${deviceId}/control`, {
        action: action, // up, down, left, right, zoom_in, zoom_out, preset_call, etc.
        ...params,
      });

      const result = response.data;
      
      if (result.code === 0) {
        this.logger.info(`🎮 PTZ action '${action}' executed for device ${deviceId}`);
        return true;
      } else {
        throw new Error(`Failed to execute PTZ action: ${result.message}`);
      }

    } catch (error) {
      this.logger.error(`Failed to execute PTZ action for ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get device status and health
   */
  async getDeviceStatus(deviceId) {
    try {
      const response = await this.httpClient.get(`/api/resource/v1/cameras/${deviceId}/status`);
      const status = response.data;
      
      if (status.code === 0) {
        return status.data;
      } else {
        throw new Error(`Failed to get device status: ${status.message}`);
      }

    } catch (error) {
      this.logger.error(`Failed to get device status for ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Clear device cache
   */
  clearCache(deviceId = null) {
    if (deviceId) {
      // Clear specific device cache
      for (const [key] of this.deviceCache) {
        if (key.includes(deviceId)) {
          this.deviceCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.deviceCache.clear();
    }
    
    this.logger.info(`🗑️  Cleared device cache${deviceId ? ` for ${deviceId}` : ''}`);
  }

  /**
   * Health check for Hikvision API connection
   */
  async healthCheck() {
    try {
      const response = await this.httpClient.get('/api/resource/v1/cameras', {
        params: { pageNo: 1, pageSize: 1 },
      });
      
      return {
        status: 'healthy',
        responseTime: response.headers['x-response-time'] || 'unknown',
        timestamp: new Date().toISOString(),
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}