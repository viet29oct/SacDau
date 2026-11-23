#!/bin/sh
# Tim dong ghi cong AI trong file (commit message, mo ta PR).
# Dung chung cho hook commit-msg va workflow CI. Co dong vi pham thi exit 1.
#
# Chi bat dong ghi cong, khong bat chu "claude"/"gemini" noi chung:
# commit kieu "docs: sua CLAUDE.md" van hop le.

f="$1"
[ -f "$f" ] || exit 0

pattern='^[[:space:]]*co-authored-by:.*(claude|anthropic|openai|codex|chatgpt|gpt-|gemini|jules|copilot|cursor|devin|aider)'
pattern="$pattern"'|generated (with|by) \[?(claude|codex|gemini|chatgpt|copilot|cursor|ai\b)'
pattern="$pattern"'|ai[- ]generated|^[[:space:]]*claude-session:|🤖'

hits=$(grep -v '^#' "$f" | grep -inE "$pattern")
[ -z "$hits" ] && exit 0

echo "Co dong ghi cong AI, xoa di roi thu lai (xem AGENTS.md muc 3):" >&2
echo "$hits" | sed 's/^/  /' >&2
exit 1
