# MarkText 构建选项说明

## 新增的构建脚本

### `npm run build:all`
编译所有平台和架构的release版本，包括：

**Windows:**
- x64架构: NSIS安装包 + ZIP压缩包
- ARM64架构: NSIS安装包 + ZIP压缩包

**macOS:**
- x64架构: DMG镜像 + ZIP压缩包
- ARM64架构: DMG镜像 + ZIP压缩包

**Linux:**
- AppImage格式 (通用Linux发行版)

### `npm run build:all:formats` (实验性)
包含更多Linux格式的完整构建：
- 所有上述格式
- 额外的Linux格式: DEB包、RPM包

## 现有构建脚本

- `npm run build` - 仅构建源码，不打包
- `npm run build:unpack` - 构建并解包到目录
- `npm run build:win` - 仅Windows平台
- `npm run build:mac` - 仅macOS平台  
- `npm run build:linux` - 仅Linux平台
- `npm run build:release` - 所有平台基础版本

## 使用建议

- **开发测试**: 使用 `npm run build:unpack`
- **单平台发布**: 使用对应的 `build:win/mac/linux`
- **完整发布**: 使用 `npm run build:all`
- **包含所有格式**: 使用 `npm run build:all:formats`

## 构建产物位置

所有构建产物都会生成到 `dist/` 目录下，文件命名格式：
- `marktext-{platform}-{arch}-{version}.{ext}`
- `marktext-{platform}-{version}-setup.{ext}` (安装包)