// The deployed commit: deploy/deploy.sh passes it into the image build (IMPLEMENTATION.md §6). "dev" anywhere else.
export const VERSION = process.env.KEPT_REVISION || 'dev'
