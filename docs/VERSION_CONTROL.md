# 🔄 JERICHO Security Type-C - Version Control Workflow

## 📋 Development Workflow

### 🌟 **Golden Rules**
1. **NEVER commit directly to `main`** - Always use feature branches
2. **ALWAYS create PRs** for code review and tracking
3. **USE semantic versioning** for releases (v2.0.0, v2.0.1, etc.)
4. **MAINTAIN clean commit history** with descriptive messages
5. **TEST before merging** - all PRs must pass checks

---

## 🚀 **Feature Development Process**

### 1. **Create Feature Branch**
```bash
# Always start from latest main
git checkout main
git pull origin main

# Create feature branch with descriptive name
git checkout -b feature/hikvision-api-integration
# or
git checkout -b fix/camera-reconnection-issue
# or  
git checkout -b docs/api-documentation-update
```

### 2. **Development & Commits**
```bash
# Make your changes...

# Stage and commit with semantic messages
git add .
git commit -m "feat: add Hikvision ISAPI integration"
git commit -m "fix: resolve camera reconnection timeout"
git commit -m "docs: update API documentation"

# Push feature branch
git push origin feature/hikvision-api-integration
```

### 3. **Create Pull Request**
- Go to GitHub repository
- Click "Compare & pull request" 
- Use provided PR template with:
  - Clear description of changes
  - Testing checklist
  - Review checklist
  - Link to related issues

### 4. **Code Review & Merge**
- Review PR changes
- Check all boxes in PR checklist
- Merge when ready (squash and merge recommended)
- Delete feature branch after merge

---

## 📦 **Release Management**

### **Version Creation**
```bash
# Create new version (auto-increments)
sudo ./scripts/version-control.sh create v2.0.1

# Or specify version
sudo ./scripts/version-control.sh create v2.1.0
```

### **Deployment**
```bash
# Deploy specific version
sudo ./scripts/deploy.sh v2.0.1

# Deploy to different environments
sudo ./scripts/deploy.sh v2.0.1 production
sudo ./scripts/deploy.sh v2.0.1 staging
```

### **Rollback (if needed)**
```bash
# Rollback to previous version
sudo ./scripts/rollback.sh v2.0.0

# Check deployment history
sudo ./scripts/deployment-history.sh
```

---

## 🏷️ **Branch Naming Convention**

### **Feature Branches**
- `feature/hikvision-api-integration`
- `feature/settings-ui-components`
- `feature/motion-detection-enhancement`

### **Bug Fix Branches**
- `fix/camera-reconnection-timeout`
- `fix/memory-leak-in-streaming`
- `fix/ui-responsive-layout`

### **Documentation Branches**
- `docs/api-documentation`
- `docs/deployment-guide`
- `docs/troubleshooting-update`

### **Hotfix Branches**
- `hotfix/security-vulnerability`
- `hotfix/critical-streaming-bug`

---

## 📝 **Commit Message Convention**

### **Format**
```
<type>: <description>

[optional body]

[optional footer]
```

### **Types**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### **Examples**
```bash
git commit -m "feat: add Hikvision camera support"
git commit -m "fix: resolve RTSP reconnection timeout"
git commit -m "docs: update installation guide for Ubuntu 24.04"
git commit -m "refactor: optimize video streaming performance"
```

---

## 🔍 **Pull Request Template**

```markdown
## 🎯 Feature/Fix Overview
Brief description of what this PR accomplishes.

## ✅ Changes Made
- [ ] List specific changes
- [ ] Include all modifications
- [ ] Mention any breaking changes

## 🧪 Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Performance impact assessed

## 📝 Notes
Any additional context or considerations.

## 🔍 Review Checklist
- [ ] Code follows project standards
- [ ] No security vulnerabilities
- [ ] Documentation updated
- [ ] Tests pass
- [ ] Performance acceptable
```

---

## 🚨 **Emergency Procedures**

### **Hotfix Process**
```bash
# Create hotfix from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-issue

# Make fix
git add .
git commit -m "hotfix: resolve critical streaming issue"
git push origin hotfix/critical-issue

# Create PR and merge immediately
# Deploy hotfix
sudo ./scripts/deploy.sh v2.0.2-hotfix
```

### **Emergency Rollback**
```bash
# Immediate rollback to last known good version
sudo ./scripts/rollback.sh v2.0.0

# Check system status
sudo systemctl status jericho-security
sudo ./scripts/health-check.sh
```

---

## 📊 **Version History Tracking**

### **List Available Versions**
```bash
sudo ./scripts/list-versions.sh
```

### **Version Information**
```bash
# Check current version
cat /opt/jericho-security/releases/current/VERSION

# View deployment history
sudo ./scripts/deployment-history.sh

# Check version differences
sudo ./scripts/version-diff.sh v2.0.0 v2.0.1
```

---

## 🔧 **Development Best Practices**

### **Before Starting Work**
1. Always pull latest main: `git pull origin main`
2. Create feature branch: `git checkout -b feature/your-feature`
3. Check current issues and PRs to avoid conflicts

### **During Development**
1. Commit frequently with clear messages
2. Push to remote branch regularly: `git push origin feature/your-feature`
3. Keep feature branches focused and small

### **Before Creating PR**
1. Rebase on latest main: `git rebase main`
2. Run tests: `npm run test`
3. Check linting: `npm run lint`
4. Test deployment locally: `npm run build`

### **After PR Merge**
1. Delete local feature branch: `git branch -d feature/your-feature`
2. Delete remote branch: `git push origin --delete feature/your-feature`
3. Update local main: `git checkout main && git pull origin main`

---

## 📈 **Integration with CI/CD**

### **Automated Checks** (Future)
- Unit tests on every push
- Integration tests on PR creation
- Security scans for vulnerabilities
- Performance benchmarks
- Docker image builds

### **Deployment Pipeline** (Future)
- Staging deployment on PR merge
- Production deployment on release tag
- Automatic rollback on health check failure
- Notification integrations (Slack, email)

---

## 🎯 **Success Metrics**

### **Version Control Health**
- No direct commits to main branch
- All features developed in branches
- 100% PR review coverage
- Clean commit history
- Proper semantic versioning

### **Deployment Success**
- Zero-downtime deployments
- Quick rollback capability (<5 minutes)
- Version tracking accuracy
- Environment consistency

---

**This workflow ensures reliable, trackable, and maintainable development of JERICHO Security Type-C! 🛡️**
