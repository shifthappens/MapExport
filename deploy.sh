#!/bin/bash
# Deploy mapexport to coen.at
rsync -avz --delete \
  -e "ssh -i ~/.ssh/Andromeda_ed25519" \
  --exclude='.git' \
  --exclude='.claude' \
  --exclude='.DS_Store' \
  --exclude='test.txt' \
  --exclude='cache/*.json' \
  --exclude='cache/*.json.gz' \
  /Users/coen/Sites/mapexport/ \
  root@142.93.135.135:/var/www/html/domains/coen.at/public_html/mapexport/
