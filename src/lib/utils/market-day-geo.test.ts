import { describe, expect, it } from 'vitest';

import {
	openStreetMapEmbedUrl,
	openStreetMapLink,
	parseCoordinateValue,
	parseStandPosition,
	roundCoordinate
} from './market-day-geo';

describe('market day geo', () => {
	it('parses coordinates with a comma or a dot and rejects empty values', () => {
		expect(parseCoordinateValue('52.5145')).toBe(52.5145);
		expect(parseCoordinateValue('52,5145')).toBe(52.5145);
		expect(parseCoordinateValue(' 13.3501 ')).toBe(13.3501);
		expect(parseCoordinateValue('-13.5')).toBe(-13.5);
		expect(parseCoordinateValue(48.2)).toBe(48.2);
		expect(parseCoordinateValue('')).toBeNull();
		expect(parseCoordinateValue('   ')).toBeNull();
		expect(parseCoordinateValue(null)).toBeNull();
		expect(parseCoordinateValue(undefined)).toBeNull();
		expect(parseCoordinateValue('keine Koordinaten')).toBeNull();
	});

	it('accepts a complete position only inside the valid ranges', () => {
		expect(parseStandPosition('52,5145', '13,3501')).toEqual({
			latitude: 52.5145,
			longitude: 13.3501
		});
		expect(parseStandPosition('90', '-180')).toEqual({ latitude: 90, longitude: -180 });

		// assume - one coordinate is enough to keep the position off the map
		expect(parseStandPosition('', '13,3501')).toBeNull();
		expect(parseStandPosition('52,5145', '')).toBeNull();
		expect(parseStandPosition('91', '13,3501')).toBeNull();
		expect(parseStandPosition('52,5145', '181')).toBeNull();
		expect(parseStandPosition('nord', 'ost')).toBeNull();
	});

	it('rounds a position to the stored precision', () => {
		expect(roundCoordinate(52.5145004123)).toBe(52.5145);
		expect(roundCoordinate(13.35010098765)).toBe(13.350101);
	});

	it('builds the map preview and the map link for a position', () => {
		const position = { latitude: 52.5145, longitude: 13.3501 };

		// act
		const embedUrl = openStreetMapEmbedUrl(position);
		const mapLink = openStreetMapLink(position);

		// assume
		expect(embedUrl).toBe(
			'https://www.openstreetmap.org/export/embed.html?bbox=13.3461,52.5125,13.3541,52.5165&layer=mapnik&marker=52.5145,13.3501'
		);
		expect(mapLink).toBe(
			'https://www.openstreetmap.org/?mlat=52.5145&mlon=13.3501#map=17/52.5145/13.3501'
		);
	});
});
