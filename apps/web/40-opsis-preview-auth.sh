#!/bin/sh
set -eu
# The Opsis build embeds this switch. Missing runtime protection fails startup.
access_config=/etc/nginx/opsis-preview-access.conf
if [ "${OPSIS_PUBLIC_ACCESS_ENABLED:-false}" = "true" ]; then
  printf '%s\n' 'auth_basic off; # Founder-authorized public Opsis preview (D13).' > "$access_config"
elif [ "${OPSIS_PRIVATE_PREVIEW:-false}" = "true" ]; then
  : "${OPSIS_INGRESS_PASSWORD_HASH:?Private Opsis preview requires an ingress password hash}"
  case "$OPSIS_INGRESS_PASSWORD_HASH" in
    \$apr1\$*) ;;
    *) echo 'Invalid Opsis ingress hash format' >&2; exit 1 ;;
  esac
  # Reject configuration/file injection without printing the value.
  if printf '%s' "$OPSIS_INGRESS_PASSWORD_HASH" | LC_ALL=C grep -q '[^a-zA-Z0-9./$]'; then
    echo 'Invalid Opsis ingress hash characters' >&2; exit 1
  fi
  umask 077
  printf 'opsis:%s\n' "$OPSIS_INGRESS_PASSWORD_HASH" > /etc/nginx/opsis-preview.htpasswd
  # Nginx workers must read the hash, but it is never part of the static root.
  chmod 644 /etc/nginx/opsis-preview.htpasswd
  printf '%s\n' 'auth_basic "Opsis private preview";' 'auth_basic_user_file /etc/nginx/opsis-preview.htpasswd;' > "$access_config"
else
  printf '%s\n' '# Standard non-Opsis build: existing route controls apply.' > "$access_config"
fi
unset OPSIS_INGRESS_PASSWORD_HASH
