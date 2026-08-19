const configuredAssetBaseUrl = String(import.meta.env.VITE_ASSET_BASE_URL || '').trim();

export const assetBaseUrl = (configuredAssetBaseUrl || '/assets').replace(/\/+$/, '');

export function assetUrl(fileName) {
  return `${assetBaseUrl}/${String(fileName).replace(/^\/+/, '')}`;
}
