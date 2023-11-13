# WGSL tests for MSL bug with usub.sat intrinsic

This project contains a set of tests that exercise a bug with the lowering of
LLVM's `llvm.usub.sat.*` intrinsics with MSL on Apple Silicon.

## Building

Initial setup:

    npm ci

Recompiling after changes:

    npx tsc
