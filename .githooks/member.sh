#!/bin/sh
# Tra .github/members.txt. Dung chung cho hook pre-push va CI.
#
#   sh .githooks/member.sh <cot-tim> <gia-tri> <cot-lay> [file]
#
# Cot: 1 ten, 2 nhanh, 3 github, 4 git (user.name), 5 vai_tro.
# In gia tri cot-lay cua dong dau tien khop, khong khop thi khong in gi.
# Vd: sh .githooks/member.sh 3 viet29oct 5   ->  maintainer

col="$1"; val="$2"; out="$3"
file="${4:-$(dirname "$0")/../.github/members.txt}"
[ -f "$file" ] || exit 0
[ -n "$val" ] && [ "$val" != "-" ] || exit 0

awk -F'|' -v c="$col" -v v="$val" -v o="$out" '
  function t(s) { gsub(/^[ \t\r]+|[ \t\r]+$/, "", s); return s }
  /^[ \t]*#/ || NF < 5 { next }
  t($c) == v { print t($o); exit }
' "$file"
