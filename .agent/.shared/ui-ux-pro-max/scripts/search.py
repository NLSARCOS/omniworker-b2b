#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UI/UX Pro Max Search - BM25 search engine for UI/UX style guides
Usage: python search.py "<query>" [--domain <domain>] [--stack <stack>] [--max-results 3]
       python search.py "<query>" --design-system [-p "Project Name"]
       python search.py "<query>" --design-system --persist [-p "Project Name"] [--page "dashboard"]
       python search.py --brand linear
       python search.py "<query>" --brand-search
       python search.py --list-brands

Domains: style, prompt, color, chart, landing, product, ux, typography
Stacks: html-tailwind, react, nextjs, vue, svelte, swiftui, react-native, flutter, shadcn, jetpack-compose

Brand System (NEW):
  --brand <brand_id>     Get complete design system for a specific brand (linear, vercel, stripe, etc.)
  --brand-search         Search brands by keywords
  --list-brands          List all available brands

Persistence (Master + Overrides pattern):
  --persist    Save design system to design-system/MASTER.md
  --page       Also create a page-specific override file in design-system/pages/
"""

import argparse
from core import CSV_CONFIG, AVAILABLE_STACKS, MAX_RESULTS, search, search_stack
from design_system import generate_design_system, persist_design_system
from brands import search_brands, get_brand_design_system, list_brands, get_brand


def format_output(result):
    """Format results for Claude consumption (token-optimized)"""
    if "error" in result:
        return f"Error: {result['error']}"

    output = []
    if result.get("stack"):
        output.append(f"## UI Pro Max Stack Guidelines")
        output.append(f"**Stack:** {result['stack']} | **Query:** {result['query']}")
    else:
        output.append(f"## UI Pro Max Search Results")
        output.append(f"**Domain:** {result['domain']} | **Query:** {result['query']}")
    output.append(f"**Source:** {result['file']} | **Found:** {result['count']} results\n")

    for i, row in enumerate(result['results'], 1):
        output.append(f"### Result {i}")
        for key, value in row.items():
            value_str = str(value)
            if len(value_str) > 300:
                value_str = value_str[:300] + "..."
            output.append(f"- **{key}:** {value_str}")
        output.append("")

    return "\n".join(output)


def format_brand_list(brands):
    """Format brand list for display"""
    lines = ["## Available Brands", ""]
    
    # Group by category
    by_category = {}
    for b in brands:
        cat = b.get('category', 'Other')
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(b)
    
    for category, brand_list in sorted(by_category.items()):
        lines.append(f"### {category}")
        for b in brand_list:
            lines.append(f"- **{b['id']}**: {b['name']} — {b['keywords']}")
        lines.append("")
    
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="UI Pro Max Search")
    parser.add_argument("query", nargs="?", help="Search query")
    parser.add_argument("--domain", "-d", choices=list(CSV_CONFIG.keys()), help="Search domain")
    parser.add_argument("--stack", "-s", choices=AVAILABLE_STACKS, help="Stack-specific search (html-tailwind, react, nextjs)")
    parser.add_argument("--max-results", "-n", type=int, default=MAX_RESULTS, help="Max results (default: 3)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    # Design system generation
    parser.add_argument("--design-system", "-ds", action="store_true", help="Generate complete design system recommendation")
    parser.add_argument("--project-name", "-p", type=str, default=None, help="Project name for design system output")
    parser.add_argument("--format", "-f", choices=["ascii", "markdown"], default="ascii", help="Output format for design system")
    
    # Persistence (Master + Overrides pattern)
    parser.add_argument("--persist", action="store_true", help="Save design system to design-system/MASTER.md (creates hierarchical structure)")
    parser.add_argument("--page", type=str, default=None, help="Create page-specific override file in design-system/pages/")
    parser.add_argument("--output-dir", "-o", type=str, default=None, help="Output directory for persisted files (default: current directory)")
    
    # Brand system (NEW)
    parser.add_argument("--brand", "-b", type=str, metavar="BRAND_ID", help="Get design system for specific brand (e.g., linear, vercel, stripe)")
    parser.add_argument("--brand-search", action="store_true", help="Search brands by query keywords")
    parser.add_argument("--list-brands", action="store_true", help="List all available brands")
    parser.add_argument("--similar-to", type=str, metavar="BRAND_ID", help="Find brands similar to specified brand")

    args = parser.parse_args()

    # Brand system commands (take priority)
    if args.list_brands:
        brands = list_brands()
        print(format_brand_list(brands))
        
    elif args.brand:
        # Get specific brand design system
        result = get_brand_design_system(args.brand, args.format)
        print(result)
        
    elif args.brand_search:
        if not args.query:
            print("Error: --brand-search requires a query. Usage: search.py '<query>' --brand-search")
        else:
            results = search_brands(args.query, args.max_results)
            if results:
                print(f"## Brand Search: '{args.query}'")
                print(f"Found {len(results)} matching brands:\n")
                for r in results:
                    print(f"### {r.get('name', '')} (`{r.get('brand_id', '')}`)")
                    print(f"- **Category**: {r.get('category', '')}")
                    print(f"- **Style**: {r.get('style_keywords', '')}")
                    print(f"- **Colors**: {r.get('primary_color', '')} / {r.get('bg_color_dark', '')}")
                    print(f"- **Fonts**: {r.get('font_heading', '')} / {r.get('font_body', '')}")
                    print("")
            else:
                print(f"No brands found matching '{args.query}'")
                print("\nUse --list-brands to see all available brands.")
                
    elif args.similar_to:
        # Find similar brands
        brand = get_brand(args.similar_to)
        if not brand:
            print(f"Brand '{args.similar_to}' not found. Use --list-brands to see available brands.")
        else:
            # Search by category and style keywords
            query = f"{brand.get('category', '')} {brand.get('style_keywords', '')}"
            results = search_brands(query, args.max_results + 1)  # +1 because brand itself will match
            # Filter out the brand itself
            results = [r for r in results if r.get('brand_id', '').lower() != args.similar_to.lower()]
            results = results[:args.max_results]
            
            if results:
                print(f"## Brands Similar to {brand.get('name', '')}")
                print(f"Based on: {brand.get('category', '')} — {brand.get('style_keywords', '')}\n")
                for r in results:
                    print(f"- **{r.get('name', '')}** (`{r.get('brand_id', '')}`): {r.get('style_keywords', '')}")
            else:
                print(f"No similar brands found for {brand.get('name', '')}")
    
    # Design system takes priority
    elif args.design_system:
        result = generate_design_system(
            args.query, 
            args.project_name, 
            args.format,
            persist=args.persist,
            page=args.page,
            output_dir=args.output_dir
        )
        print(result)
        
        # Print persistence confirmation
        if args.persist:
            project_slug = args.project_name.lower().replace(' ', '-') if args.project_name else "default"
            print("\n" + "=" * 60)
            print(f"✅ Design system persisted to design-system/{project_slug}/")
            print(f"   📄 design-system/{project_slug}/MASTER.md (Global Source of Truth)")
            if args.page:
                page_filename = args.page.lower().replace(' ', '-')
                print(f"   📄 design-system/{project_slug}/pages/{page_filename}.md (Page Overrides)")
            print("")
            print(f"📖 Usage: When building a page, check design-system/{project_slug}/pages/[page].md first.")
            print(f"   If exists, its rules override MASTER.md. Otherwise, use MASTER.md.")
            print("=" * 60)
    
    # Stack search
    elif args.stack:
        result = search_stack(args.query, args.stack, args.max_results)
        if args.json:
            import json
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print(format_output(result))
    
    # Domain search
    elif args.query:
        result = search(args.query, args.domain, args.max_results)
        if args.json:
            import json
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print(format_output(result))
    else:
        parser.print_help()
