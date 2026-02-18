# Dance Scoring App - Design Mockup

## Overview
This mockup demonstrates a tile-based scoring interface for judges evaluating dance auditions. Judges score groups of ~5 dancers performing simultaneously across 5 categories (Technique, Musicality, Expression, Timing, Presentation) on a 1-5 scale.

## Key Requirements
- **Real-time scoring**: Judges observe all dancers performing together in a ~5-minute window
- **Edit capability**: Scores can be changed during/after performance
- **Speed + accuracy**: Fast input with minimal learning curve (replacing paper-based system)
- **Multi-device**: Optimized for laptops and tablets (landscape & portrait)

## Design Approach: Tile-Based Layout

### Why Tiles?
1. **Spatial consistency**: Each dancer maintains the same position across sessions, building muscle memory
2. **Visual progress tracking**: Color-coded borders show completion status at a glance
3. **Minimal navigation**: All dancers accessible without switching views/modes
4. **Familiar pattern**: Mirrors the physical layout of paper scoring sheets

## Layout Options

### Landscape (Laptops & Horizontal Tablets)
- **5 columns** side-by-side
- All dancers visible simultaneously
- Spacious tap targets (~44px)
- Full category names

### Portrait - Single Column (Vertical Tablets/Phones)
- **Vertical scrolling** through tiles
- 2-3 tiles visible at once
- Same spacious tap targets as landscape
- Full category names
- More scrolling required

### Portrait - Two Columns (Vertical Tablets)
- **2x3 grid** layout (less scrolling)
- 4 tiles visible at once
- Slightly smaller tap targets (~36px, still touch-friendly)
- Abbreviated category names ("Tech", "Music", "Expr", "Time", "Pres")
- **Recommended for tablets** - good balance of visibility and usability

## Visual Design Elements

### Color Coding (Border Colors)
- **Green**: Fully scored (5/5 categories completed) ✓
- **Orange**: Partially scored (1-4 categories completed)
- **Gray**: Not started (0/5 categories)

### Completion Indicator
- Shows fraction of categories scored (e.g., "3/5")
- Updates in real-time as scores are entered
- Provides at-a-glance progress tracking

### Score Buttons
- 1-5 rating buttons for each category
- Clear visual feedback when selected (blue background)
- Tap to select, tap again on different number to change
- Large enough for confident tapping without hunting

## User Flow
1. Judge opens app to see all 5 dancers in their performance group
2. As dancers perform, judge taps scores for each category
3. Color-coded borders show which dancers still need scoring
4. Judge can scroll (if needed) to access all dancers
5. After performance ends, judge reviews and adjusts any scores
6. Process repeats for next group

## Design Decisions

### Chosen: Tile-based over alternatives
- **Alternative considered**: Single-column swipe-through interface
- **Why tiles won**: Better situational awareness, less navigation overhead during time-critical scoring

### Chosen: Two-column for portrait tablets
- **Alternative considered**: Single column (less compressed)
- **Why two-column won**: Reduces scrolling significantly (1.5 screens vs 2.5 screens), judges can see overall progress more easily during time-critical window

### Chosen: Always-visible scoring
- **Alternative considered**: Accordion/expand-collapse interface
- **Why always-visible won**: Faster access, no extra taps needed during performance

## Technical Notes
- Interactive mockup built in vanilla HTML/CSS/JS
- Demonstrates responsive layouts for different orientations
- Click score buttons to see state management
- Toggle between layout options to compare approaches

## Next Steps for Development
1. Get stakeholder approval on design approach
2. Implement backend data model (dancer groups, scoring sessions, judges)
3. Build responsive tile component in chosen framework
4. Add data persistence and sync
5. Test with actual judges using sample audition footage
6. Iterate on button sizes and spacing based on user feedback

## Files
- `dance-scoring-mockup.html` - Interactive mockup with all three layouts
- This README - Design context and rationale

---

**Last Updated**: January 2026  
**Status**: Awaiting stakeholder approval
