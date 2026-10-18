/**
 * Stand positions for market days: parsing, range checks and OpenStreetMap URLs.
 *
 * The owner may type a coordinate with a comma as the decimal separator (German keyboard), paste a
 * value from a phone, or let the browser fill in a position from its location service. Everything
 * that turns such a value into a number, and everything that turns a number into a map URL, lives
 * here so the server validation and the browser preview cannot drift apart.
 */

/** Accepted latitude range in degrees (WGS84). */
export const latitudeRange = { minimum: -90, maximum: 90 } as const;

/** Accepted longitude range in degrees (WGS84). */
export const longitudeRange = { minimum: -180, maximum: 180 } as const;

/** Number of decimals a position is stored and shown with; ~11 cm at the equator. */
export const coordinateDecimals = 6;

/** The horizontal span of the map preview, in degrees. */
const mapPreviewLongitudeSpan = 0.004;

/** The vertical span of the map preview, in degrees. */
const mapPreviewLatitudeSpan = 0.002;

/** The zoom level of the full map page a visitor opens. */
const mapLinkZoom = 17;

export interface StandPosition {
	latitude: number;
	longitude: number;
}

/**
 * Parse an optional coordinate from a form value.
 *
 * @param {number | string | null | undefined} value - Raw value; a comma counts as a decimal
 * separator.
 * @returns {number | null} The coordinate, or null when the field is empty or not a number.
 */
export function parseCoordinateValue(value: number | string | null | undefined): number | null {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
	if (typeof normalized === 'string' && normalized === '') {
		return null;
	}
	const parsed = typeof normalized === 'number' ? normalized : Number.parseFloat(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Resolve a complete stand position from two form values.
 *
 * @param {number | string | null | undefined} latitudeValue - Raw latitude.
 * @param {number | string | null | undefined} longitudeValue - Raw longitude.
 * @returns {StandPosition | null} The position, or null when a coordinate is missing or outside
 * its accepted range.
 */
export function parseStandPosition(
	latitudeValue: number | string | null | undefined,
	longitudeValue: number | string | null | undefined
): StandPosition | null {
	const latitude = parseCoordinateValue(latitudeValue);
	const longitude = parseCoordinateValue(longitudeValue);
	if (latitude === null || longitude === null) {
		return null;
	}
	if (latitude < latitudeRange.minimum || latitude > latitudeRange.maximum) {
		return null;
	}
	if (longitude < longitudeRange.minimum || longitude > longitudeRange.maximum) {
		return null;
	}
	return { latitude, longitude };
}

/**
 * Round a coordinate to the stored precision.
 *
 * @param {number} value - Coordinate in degrees.
 * @returns {number} The rounded coordinate.
 */
export function roundCoordinate(value: number): number {
	return Number(value.toFixed(coordinateDecimals));
}

/**
 * Build the OpenStreetMap embed URL for a position, marker included.
 *
 * @param {StandPosition} position - The stand position.
 * @returns {string} URL for an iframe.
 */
export function openStreetMapEmbedUrl(position: StandPosition): string {
	// Round every value: 52.5145 - 0.002 would otherwise land in the URL as 52.512499999999996.
	const bounds = [
		position.longitude - mapPreviewLongitudeSpan,
		position.latitude - mapPreviewLatitudeSpan,
		position.longitude + mapPreviewLongitudeSpan,
		position.latitude + mapPreviewLatitudeSpan
	]
		.map(roundCoordinate)
		.join(',');
	const marker = `${roundCoordinate(position.latitude)},${roundCoordinate(position.longitude)}`;
	return `https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${marker}`;
}

/**
 * Build the OpenStreetMap page URL for a position, marker included.
 *
 * @param {StandPosition} position - The stand position.
 * @returns {string} URL for a new browser tab.
 */
export function openStreetMapLink(position: StandPosition): string {
	const latitude = roundCoordinate(position.latitude);
	const longitude = roundCoordinate(position.longitude);
	return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${mapLinkZoom}/${latitude}/${longitude}`;
}
