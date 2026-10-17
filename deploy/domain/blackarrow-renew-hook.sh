#!/bin/sh
# Reload only after successful renewal of this explicitly authorized hostname.
case " ${RENEWED_DOMAINS:-} " in
  *" app.blackgoldfertilizer.com "*) /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx ;;
esac
