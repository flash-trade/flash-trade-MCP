#!/bin/bash
set -e

VERSION=$(bun -e "console.log(require('./package.json').version)")
echo "Building flash-cli v${VERSION}..."

# ESM bundle (for npm)
bun build src/index.ts --outdir dist --target node --format esm --minify

# Standalone binaries
mkdir -p builds

bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile builds/flash-darwin-arm64
bun build src/index.ts --compile --target=bun-darwin-x64 --outfile builds/flash-darwin-x64
bun build src/index.ts --compile --target=bun-linux-x64 --outfile builds/flash-linux-x64
bun build src/index.ts --compile --target=bun-linux-arm64 --outfile builds/flash-linux-arm64

# Checksums
cd builds && shasum -a 256 flash-* > checksums.txt && cd ..

echo "Builds complete:"
ls -la builds/
