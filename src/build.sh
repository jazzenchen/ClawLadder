#!/bin/bash

# ClawLadder 构建脚本 (Apple Silicon only)
# 使用方法：在 src/ 目录运行 ./build.sh
# 从 src/apple-sign.config 读取签名配置

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR"
SIGN_CONFIG="$SRC_DIR/apple-sign.config"

echo -e "${GREEN}🦞 ClawLadder 构建脚本${NC}"
echo ""

# 检查目录结构
if [ ! -f "$SRC_DIR/package.json" ]; then
    echo -e "${RED}❌ 找不到 src/package.json，请在项目根目录运行${NC}"
    exit 1
fi

# ============================================
# 版本号管理
# ============================================
echo -e "${BLUE}📦 版本号管理${NC}"

CURRENT_VERSION=$(node -p "require('$SRC_DIR/desktop/tauri.conf.json').version")
echo -e "当前版本: ${YELLOW}${CURRENT_VERSION}${NC}"

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"
echo -e "新版本: ${GREEN}${NEW_VERSION}${NC}"
echo ""

# 备份
cp "$SRC_DIR/desktop/tauri.conf.json" "$SRC_DIR/desktop/tauri.conf.json.backup"
cp "$SRC_DIR/desktop/Cargo.toml" "$SRC_DIR/desktop/Cargo.toml.backup"
cp "$SRC_DIR/server/Cargo.toml" "$SRC_DIR/server/Cargo.toml.backup"
cp "$SRC_DIR/core/Cargo.toml" "$SRC_DIR/core/Cargo.toml.backup"

cleanup_on_error() {
    echo -e "${RED}❌ 构建失败，回滚版本号...${NC}"
    mv "$SRC_DIR/desktop/tauri.conf.json.backup" "$SRC_DIR/desktop/tauri.conf.json"
    mv "$SRC_DIR/desktop/Cargo.toml.backup" "$SRC_DIR/desktop/Cargo.toml"
    mv "$SRC_DIR/server/Cargo.toml.backup" "$SRC_DIR/server/Cargo.toml"
    mv "$SRC_DIR/core/Cargo.toml.backup" "$SRC_DIR/core/Cargo.toml"
    exit 1
}
trap cleanup_on_error ERR

# 更新版本号
echo -e "${BLUE}📝 更新版本号...${NC}"

node -e "
const fs = require('fs');
const conf = JSON.parse(fs.readFileSync('$SRC_DIR/desktop/tauri.conf.json', 'utf8'));
conf.version = '${NEW_VERSION}';
fs.writeFileSync('$SRC_DIR/desktop/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');
"

node -e "
const fs = require('fs');
['$SRC_DIR/desktop/Cargo.toml', '$SRC_DIR/server/Cargo.toml', '$SRC_DIR/core/Cargo.toml'].forEach(f => {
  let t = fs.readFileSync(f, 'utf8');
  t = t.replace(/^version = \".*\"/m, 'version = \"${NEW_VERSION}\"');
  fs.writeFileSync(f, t);
});
"

echo -e "${GREEN}✅ 版本号已更新为 ${NEW_VERSION}${NC}"
echo ""

# ============================================
# 签名 & 公证配置
# ============================================

if [ -f "$SIGN_CONFIG" ]; then
    echo -e "${BLUE}📄 加载签名配置...${NC}"
    set -a
    source "$SIGN_CONFIG"
    set +a
fi

# 默认公证
NEED_NOTARIZATION="true"

if [ -z "$APPLE_ID" ] || [ -z "$APPLE_TEAM_ID" ]; then
    echo -e "${RED}❌ APPLE_ID 或 APPLE_TEAM_ID 未设置，请检查 src/apple-sign.config${NC}"
    exit 1
fi
APPLE_PASSWORD="${APPLE_PASSWORD:-$APPLE_APP_SPECIFIC_PASSWORD}"
if [ -z "$APPLE_PASSWORD" ]; then
    echo -e "${RED}❌ APPLE_PASSWORD 未设置${NC}"
    exit 1
fi
export APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
echo -e "  Apple ID: $APPLE_ID"
echo -e "  Team ID: $APPLE_TEAM_ID"
echo ""

# ============================================
# 构建
# ============================================
echo -e "${YELLOW}🔨 开始构建 (aarch64)...${NC}"
echo ""

cd "$SRC_DIR"
bun run --cwd desktop tauri build --bundles app

echo ""
echo -e "${GREEN}✅ 应用构建完成${NC}"
echo ""

# ============================================
# 打包 DMG
# ============================================
BUNDLE_DIR="$SRC_DIR/target/release/bundle"
APP_FILE=$(find "$BUNDLE_DIR/macos" -name "ClawLadder.app" -type d 2>/dev/null | head -1)

if [ -z "$APP_FILE" ]; then
    echo -e "${RED}❌ 未找到 .app 文件${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 创建 DMG...${NC}"

DMG_OUTPUT_DIR="$BUNDLE_DIR/dmg"
DMG_FILE="$DMG_OUTPUT_DIR/ClawLadder_${NEW_VERSION}_aarch64.dmg"
DMG_TEMP_DIR="/tmp/clawladder_dmg_$$"
DMG_TEMP_FILE="/tmp/ClawLadder_$$.dmg"

hdiutil detach /Volumes/ClawLadder-Installer 2>/dev/null || true
rm -rf "$DMG_TEMP_DIR" 2>/dev/null || true
mkdir -p "$DMG_TEMP_DIR" "$DMG_OUTPUT_DIR"
cp -R "$APP_FILE" "$DMG_TEMP_DIR/"
ln -sf /Applications "$DMG_TEMP_DIR/Applications"

if hdiutil create -volname "ClawLadder-Installer" -srcfolder "$DMG_TEMP_DIR" -ov -format UDZO "$DMG_TEMP_FILE"; then
    rm -f "$DMG_FILE" 2>/dev/null || true
    mv "$DMG_TEMP_FILE" "$DMG_FILE"
    echo -e "${GREEN}✅ DMG 创建成功${NC}"

    # 签名 DMG
    SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: shenjie Chen (4H8CWRAN3M)}"
    echo -e "${BLUE}🔏 签名 DMG (${SIGNING_IDENTITY})...${NC}"
    if codesign --force --sign "$SIGNING_IDENTITY" "$DMG_FILE"; then
        echo -e "${GREEN}✅ DMG 签名成功${NC}"
    else
        echo -e "${YELLOW}⚠️  DMG 签名失败${NC}"
    fi
else
    echo -e "${RED}❌ DMG 创建失败${NC}"
    DMG_FILE=""
fi

rm -rf "$DMG_TEMP_DIR" 2>/dev/null || true
rm -f "$DMG_TEMP_FILE" 2>/dev/null || true
echo ""

# ============================================
# 公证
# ============================================
if [ "$NEED_NOTARIZATION" = "true" ] && [ -n "$DMG_FILE" ] && [ -f "$DMG_FILE" ]; then
    echo -e "${YELLOW}📦 公证中...${NC}"
    NOTARIZATION_OUTPUT=$(xcrun notarytool submit "$DMG_FILE" \
        --wait \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" 2>&1)

    echo "$NOTARIZATION_OUTPUT"

    if echo "$NOTARIZATION_OUTPUT" | grep -q "status: Accepted"; then
        echo -e "${GREEN}✅ 公证成功${NC}"
        xcrun stapler staple "$DMG_FILE" 2>&1 || true
    else
        echo -e "${RED}❌ 公证失败${NC}"
    fi
    echo ""
fi

# ============================================
# 验证
# ============================================
if [ -n "$APP_FILE" ]; then
    echo -e "${BLUE}🔍 验证签名...${NC}"
    if codesign -vv --deep --strict "$APP_FILE" 2>&1 | grep -q "valid on disk"; then
        echo -e "${GREEN}✅ .app 签名有效${NC}"
    else
        echo -e "${RED}❌ .app 签名无效${NC}"
    fi
    echo ""
fi

# ============================================
# 完成
# ============================================
rm -f "$SRC_DIR/desktop/tauri.conf.json.backup"
rm -f "$SRC_DIR/desktop/Cargo.toml.backup"
rm -f "$SRC_DIR/server/Cargo.toml.backup"
rm -f "$SRC_DIR/core/Cargo.toml.backup"

echo -e "${GREEN}✅ 构建完成！版本 ${NEW_VERSION}${NC}"
if [ -n "$DMG_FILE" ] && [ -f "$DMG_FILE" ]; then
    echo "输出: $DMG_FILE"
fi
