#!/usr/bin/env python3
# FILE: assets/icon/gen.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Generate every Mark icon source (macOS art, full-bleed raster source, Icon Composer layers) from one pilcrow geometry (C-33).
#   SCOPE: Writes SVGs and AppIcon.icon/icon.json next to this file; no rasterisation (build.sh does that).
#   DEPENDS: python3 stdlib only.
#   LINKS: .grace/changes/active/C-33; assets/icon/build.sh
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   PAPER/INK/MARKER/... - palette (light, dark, tinted reference).
#   glyph - ink outline + stems and bowl fill for a given transform.
#   macos_art - squircle-on-canvas art with drop shadow (classic icns look); glyph_scale enlarges the glyph for 32/64 px renditions.
#   full_bleed - squircle filling the canvas, no shadow (Windows/Linux/web).
#   icon_composer - AppIcon.icon bundle: layer SVGs + icon.json with dark specializations.
# END_MODULE_MAP
#
# START_CHANGE_SUMMARY
#   LAST_CHANGE: v1.0.0 - C-33: round-4 glyph (chisel-tip bowl, nib-cut feet, shorter right stem) after the Prosely look-alike finding; outline drawn as an evenodd ring so Icon Composer layer fills keep the bowl open.
# END_CHANGE_SUMMARY

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

PAPER_TOP, PAPER_BOTTOM = '#FAF6EE', '#EFE7D8'
INK = '#17191E'
MARKER = '#FFCF1A'
DARK_TOP, DARK_BOTTOM = '#2C3038', '#121418'
CREAM = '#F2ECE0'
MARKER_DARK_TOP, MARKER_DARK_BOTTOM = '#FFDD55', '#FFB000'
TINT_TOP, TINT_BOTTOM, TINT_BOWL = '#555C68', '#363B44', '#8A919C'

# Glyph geometry in the 1024 macOS art frame (squircle body 824 at 100,100).
# Round 4 (anti-lookalike): the bowl is a chisel-tip highlighter — its
# left edge slants (~12 degrees) like the chisel that cuts the stem
# feet — and the right stem is shorter. This breaks the stock pilcrow
# silhouette (round D bowl + two equal square stems) shared by Prosely,
# SF Symbols paragraphsign and Material format_paragraph.
BOWL = 'M592 278 V570 H396 Q364 570 357 540 L307 302 Q303 278 327 278 Z'
# Ink outline as a filled ring (bowl grown by 28 minus the bowl), not a
# stroke: Icon Composer recolours a layer by filling every shape, which
# would turn a fill="none" stroke path into a solid blob.
RING = 'M620 250 V598 H392 Q342 598 330 550 L279 306 Q272 250 320 250 Z ' + BOWL
# Stems with nib-cut feet (rise 30 over the 80 stem width, ~20 deg) and a
# crossbar; the right stem is ~9% shorter.
STEMS = [
    'M568 250 H632 Q640 250 640 258 V780 L560 810 V258 Q560 250 568 250 Z',
    'M712 250 H776 Q784 250 784 258 V728 L704 758 V258 Q704 250 712 250 Z',
    'M568 250 H776 Q784 250 784 258 V322 Q784 330 776 330 H568 Q560 330 560 322 V258 Q560 250 568 250 Z',
]
GLYPH_SHIFT = (-22, -24)
BODY, BODY_AT, RADIUS = 824, 100, 186

SHADOW = ('<filter id="sh" x="-20%" y="-20%" width="140%" height="140%">'
          '<feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.28"/></filter>')


def gradient(gid, top, bottom):
    return (f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>')


def glyph(ink, bowl, parts=('outline', 'bowl', 'stems')):
    out = []
    if 'outline' in parts:
        out.append(f'<path d="{RING}" fill="{ink}" fill-rule="evenodd"/>')
    if 'bowl' in parts:
        out.append(f'<path d="{BOWL}" fill="{bowl}"/>')
    if 'stems' in parts:
        out.append(f'<g fill="{ink}">' + ''.join(f'<path d="{d}"/>' for d in STEMS) + '</g>')
    dx, dy = GLYPH_SHIFT
    return f'<g transform="translate({dx} {dy})">{"".join(out)}</g>'


def svg(body, defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>{defs}</defs>{body}</svg>\n'


def macos_art(bg_top, bg_bottom, ink, bowl, bowl_defs='', glyph_scale=1.0):
    defs = SHADOW + gradient('g', bg_top, bg_bottom) + bowl_defs
    mark = glyph(ink, bowl)
    if glyph_scale != 1.0:
        # small sizes: a larger glyph, less paper margin
        mark = f'<g transform="translate(512 512) scale({glyph_scale}) translate(-512 -512)">{mark}</g>'
    body = (f'<rect x="{BODY_AT}" y="{BODY_AT}" width="{BODY}" height="{BODY}" rx="{RADIUS}" '
            f'fill="url(#g)" filter="url(#sh)"/>' + mark)
    return svg(body, defs)


# The squircle body scaled to fill the whole canvas.
SCALE = 1024 / BODY
FULL = f'translate({-BODY_AT * SCALE:.3f} {-BODY_AT * SCALE:.3f}) scale({SCALE:.5f})'


def full_bleed():
    body = (f'<rect width="1024" height="1024" rx="{RADIUS * SCALE:.1f}" fill="url(#g)"/>'
            f'<g transform="{FULL}">{glyph(INK, MARKER)}</g>')
    return svg(body, gradient('g', PAPER_TOP, PAPER_BOTTOM))


def layer(ink, bowl, parts):
    return svg(f'<g transform="{FULL}">{glyph(ink, bowl, parts)}</g>')


def srgb(hex_colour):
    r, g, b = (int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return f'extended-srgb:{r:.5f},{g:.5f},{b:.5f},1.00000'


def icon_composer():
    root = HERE / 'AppIcon.icon'
    (root / 'Assets').mkdir(parents=True, exist_ok=True)
    (root / 'Assets' / 'ink.svg').write_text(layer(INK, MARKER, ('outline', 'stems')))
    (root / 'Assets' / 'bowl.svg').write_text(layer(INK, MARKER, ('bowl',)))
    doc = {
        'fill-specializations': [
            {'value': {'solid': srgb('#F5EFE4')}},
            {'appearance': 'dark', 'value': {'solid': srgb('#1D2026')}},
        ],
        'groups': [
            {
                'layers': [
                    {
                        'image-name': 'ink.svg',
                        'name': 'ink',
                        'fill-specializations': [
                            {'value': {'solid': srgb(INK)}},
                            {'appearance': 'dark', 'value': {'solid': srgb(CREAM)}},
                            {'appearance': 'tinted', 'value': {'solid': srgb('#FFFFFF')}},
                        ],
                    },
                    {
                        'image-name': 'bowl.svg',
                        'name': 'bowl',
                        'fill-specializations': [
                            {'value': {'solid': srgb(MARKER)}},
                            {'appearance': 'dark', 'value': {'solid': srgb('#FFC21A')}},
                            {'appearance': 'tinted', 'value': {'solid': srgb('#8C8C8C')}},
                        ],
                    },
                ],
                'shadow': {'kind': 'neutral', 'opacity': 0.4},
                'translucency': {'enabled': True, 'value': 0.4},
            }
        ],
        'supported-platforms': {'squares': ['macOS']},
    }
    (root / 'icon.json').write_text(json.dumps(doc, indent=2) + '\n')


def main():
    (HERE / 'mark-icon.svg').write_text(macos_art(PAPER_TOP, PAPER_BOTTOM, INK, MARKER))
    (HERE / 'mark-icon-small.svg').write_text(macos_art(PAPER_TOP, PAPER_BOTTOM, INK, MARKER, glyph_scale=1.1))
    (HERE / 'mark-icon-dark.svg').write_text(
        macos_art(DARK_TOP, DARK_BOTTOM, CREAM, 'url(#bw)', gradient('bw', MARKER_DARK_TOP, MARKER_DARK_BOTTOM)))
    (HERE / 'mark-icon-tinted.svg').write_text(macos_art(TINT_TOP, TINT_BOTTOM, '#FFFFFF', TINT_BOWL))
    (HERE / 'mark-icon-full-bleed.svg').write_text(full_bleed())
    icon_composer()


if __name__ == '__main__':
    main()
