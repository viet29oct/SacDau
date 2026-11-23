#!/bin/sh
# In 1 dong neu nhanh hien tai dang cham so voi origin/main, khong thi im lang.
# Dung cho pre-push va hook SessionStart cua Claude Code. Khong bao gio chan.

cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0

# Mat mang hoac chua dang nhap GitHub thi bo qua, khong treo cho hoi mat khau
GIT_TERMINAL_PROMPT=0 git fetch -q origin main 2>/dev/null || exit 0

behind=$(git rev-list --count HEAD..origin/main 2>/dev/null) || exit 0
[ "$behind" -gt 0 ] 2>/dev/null || exit 0

branch=$(git branch --show-current)
[ -n "$branch" ] || branch=HEAD
echo "[sync main] Nhanh $branch dang cham $behind commit so voi origin/main. Lay ve truoc khi lam tiep: xem AGENTS.md muc 2."
