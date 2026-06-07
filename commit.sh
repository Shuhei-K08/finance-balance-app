#!/bin/bash
# 使い方: ./commit.sh "コミットメッセージ"
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# 残留ロックファイルを削除
rm -f .git/*.lock 2>/dev/null || true

git add -A

if [ -n "$1" ]; then
  git commit -m "$1"
else
  # メッセージ省略時はエディタを開く
  git commit
fi

echo "✅ コミット完了"
