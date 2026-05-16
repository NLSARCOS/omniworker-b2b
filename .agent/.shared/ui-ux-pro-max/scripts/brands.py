#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UI/UX Pro Max Brands - Brand-specific design system data from real websites
Provides exact colors, typography, spacing, and component patterns from popular brands.
"""

import csv
from pathlib import Path
from core import BM25, DATA_DIR

# Brand data files
BRANDS_CSV = DATA_DIR / "brands.csv"
BRAND_COMPONENTS_CSV = DATA_DIR / "brand-components.csv"
BRAND_SPACING_CSV = DATA_DIR / "brand-spacing.csv"


class BrandManager:
    """Manages brand-specific design data"""
    
    def __init__(self):
        self.brands = self._load_brands()
        self.components = self._load_components()
        self.spacing = self._load_spacing()
    
    def _load_csv(self, filepath):
        """Load CSV and return list of dicts"""
        if not filepath.exists():
            return []
        with open(filepath, 'r', encoding='utf-8') as f:
            return list(csv.DictReader(f))
    
    def _load_brands(self):
        """Load brand definitions"""
        return self._load_csv(BRANDS_CSV)
    
    def _load_components(self):
        """Load brand component patterns"""
        components = self._load_csv(BRAND_COMPONENTS_CSV)
        # Group by brand_id
        grouped = {}
        for comp in components:
            brand_id = comp.get('brand_id', '')
            if brand_id not in grouped:
                grouped[brand_id] = []
            grouped[brand_id].append(comp)
        return grouped
    
    def _load_spacing(self):
        """Load brand spacing rules"""
        spacing = self._load_csv(BRAND_SPACING_CSV)
        return {s.get('brand_id', ''): s for s in spacing}
    
    def get_brand(self, brand_id):
        """Get brand by ID"""
        for brand in self.brands:
            if brand.get('brand_id', '').lower() == brand_id.lower():
                return brand
        return None
    
    def search_brands(self, query, max_results=5):
        """Search brands by keywords using BM25"""
        if not self.brands:
            return []
        
        # Build documents from brand data
        documents = []
        for brand in self.brands:
            doc = " ".join([
                brand.get('brand_id', ''),
                brand.get('name', ''),
                brand.get('category', ''),
                brand.get('style_keywords', ''),
            ])
            documents.append(doc)
        
        # BM25 search
        bm25 = BM25()
        bm25.fit(documents)
        ranked = bm25.score(query)
        
        # Get top results
        results = []
        for idx, score in ranked[:max_results]:
            if score > 0:
                results.append(self.brands[idx])
        
        return results
    
    def get_brand_components(self, brand_id):
        """Get all component patterns for a brand"""
        return self.components.get(brand_id.lower(), [])
    
    def get_brand_spacing(self, brand_id):
        """Get spacing rules for a brand"""
        return self.spacing.get(brand_id.lower(), {})
    
    def list_brands(self):
        """List all available brands"""
        return [
            {
                "id": b.get('brand_id', ''),
                "name": b.get('name', ''),
                "category": b.get('category', ''),
                "keywords": b.get('style_keywords', '')
            }
            for b in self.brands
        ]
    
    def generate_brand_design_system(self, brand_id, include_components=True):
        """Generate a complete design system for a specific brand"""
        brand = self.get_brand(brand_id)
        if not brand:
            available = ", ".join([b.get('brand_id', '') for b in self.brands[:10]]) + "..."
            return f"Brand '{brand_id}' not found. Available: {available}"
        
        lines = []
        lines.append(f"# {brand.get('name', '')} Design System")
        lines.append(f"\n> Category: {brand.get('category', '')}")
        lines.append(f"> Style: {brand.get('style_keywords', '')}")
        lines.append("")
        
        # Color Palette
        lines.append("## Color Palette")
        lines.append(f"| Role | Color | Hex |")
        lines.append(f"|------|-------|-----|")
        lines.append(f"| Primary/Accent | Brand | `{brand.get('accent_color', '')}` |")
        lines.append(f"| Background Dark | Dark Surface | `{brand.get('bg_color_dark', '')}` |")
        lines.append(f"| Background Light | Light Surface | `{brand.get('bg_color_light', '')}` |")
        lines.append(f"| Text Dark | On Light | `{brand.get('text_color_dark', '')}` |")
        lines.append(f"| Text Light | On Dark | `{brand.get('text_color_light', '')}` |")
        lines.append("")
        
        # Typography
        lines.append("## Typography")
        lines.append(f"| Element | Font |")
        lines.append(f"|---------|------|")
        lines.append(f"| Headings | {brand.get('font_heading', '')} |")
        lines.append(f"| Body | {brand.get('font_body', '')} |")
        lines.append("")
        
        # Border Radius
        lines.append("## Border Radius")
        lines.append(f"- **Buttons**: {brand.get('button_radius', '')}")
        lines.append(f"- **Cards**: {brand.get('card_radius', '')}")
        lines.append("")
        
        # Shadow Style
        lines.append(f"## Shadow Style")
        lines.append(f"`{brand.get('shadow_style', '')}`")
        lines.append("")
        
        # Spacing
        spacing = self.get_brand_spacing(brand_id)
        if spacing:
            lines.append("## Spacing & Layout")
            lines.append(f"| Property | Value |")
            lines.append(f"|----------|-------|")
            lines.append(f"| Section Padding | {spacing.get('section_padding', '')} |")
            lines.append(f"| Grid Columns | {spacing.get('grid_columns', '')} |")
            lines.append(f"| Base Gap | {spacing.get('gap_base', '')} |")
            lines.append(f"| Max Container | {spacing.get('container_max', '')} |")
            lines.append(f"| Alternating Sections | {spacing.get('section_alternating', '')} |")
            lines.append("")
        
        # Components
        if include_components:
            components = self.get_brand_components(brand_id)
            if components:
                lines.append("## Component Patterns")
                lines.append("")
                
                current_type = None
                for comp in components:
                    comp_type = comp.get('component', '')
                    if comp_type != current_type:
                        lines.append(f"### {comp_type}")
                        current_type = comp_type
                    
                    props = comp.get('properties', '')
                    usage = comp.get('example_usage', '')
                    lines.append(f"**Properties**: `{props}`")
                    lines.append(f"**Usage**: {usage}")
                    lines.append("")
        
        return "\n".join(lines)


def search_brands(query, max_results=5):
    """Search brands by query"""
    manager = BrandManager()
    return manager.search_brands(query, max_results)


def get_brand(brand_id):
    """Get brand details"""
    manager = BrandManager()
    return manager.get_brand(brand_id)


def list_brands():
    """List all available brands"""
    manager = BrandManager()
    return manager.list_brands()


def get_brand_design_system(brand_id, format="markdown"):
    """Generate design system for a brand"""
    manager = BrandManager()
    return manager.generate_brand_design_system(brand_id, include_components=True)


if __name__ == "__main__":
    # Test
    import sys
    if len(sys.argv) > 1:
        query = sys.argv[1]
        results = search_brands(query)
        for r in results:
            print(f"- {r.get('name', '')} ({r.get('brand_id', '')}): {r.get('style_keywords', '')}")
    else:
        brands = list_brands()
        print("Available brands:")
        for b in brands:
            print(f"- {b['id']}: {b['name']} ({b['category']})")
