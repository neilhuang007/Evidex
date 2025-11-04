# Evidex API Examples

This directory contains complete examples demonstrating how to systematically cite sources and generate Word documents
using the Evidex API.

## Available Examples

### Quick Start (Recommended for Testing)

#### JavaScript/Node.js Quick Start

**File:** [`quick-start.js`](quick-start.js)

Simple interactive example to test the Evidex API.

**Requirements:**

```bash
npm install node-fetch
```

**Usage:**

```bash
node quick-start.js
```

This example demonstrates:

- Single evidence extraction
- Quality evaluation display
- Interactive Word document generation
- Error handling

---

#### Python Quick Start

**File:** [`quick-start.py`](quick-start.py)

Python version of the quick start example.

**Requirements:**

```bash
pip install requests
```

**Usage:**

```bash
python quick-start.py
```

---

### Batch Processing (Production Use)

#### JavaScript/Node.js Batch Processing

**File:** [`batch-citation-example.js`](batch-citation-example.js)

Demonstrates batch processing multiple sources with parallel citation and bulk document generation.

**Requirements:**

```bash
npm install node-fetch
```

**Usage:**

```bash
# Update API_BASE constant with your deployment URL
node batch-citation-example.js
```

**Features:**

- Parallel citation of multiple sources
- Quality score filtering
- Alternating highlight colors
- Error handling
- Progress logging

---

#### Python Batch Processing

**File:** [`batch-citation-example.py`](batch-citation-example.py)

Python implementation with the same functionality as the JavaScript version.

**Requirements:**

```bash
pip install requests
```

**Usage:**

```bash
# Update API_BASE constant with your deployment URL
python batch-citation-example.py
```

**Features:**

- Sequential/parallel citation processing
- Type hints for better code clarity
- Quality filtering with threshold
- Comprehensive error handling
- Summary statistics

---

## Workflow

Both examples follow the same systematic workflow:

```
1. Define Sources
   ↓
2. Call /api/cite for Each Source (Parallel)
   ↓
3. Collect Card Data (cite, content, evaluation)
   ↓
4. Filter by Quality Score (Optional)
   ↓
5. Call /api/download-docx-bulk
   ↓
6. Save Word Document
```

## Customization

### Adding Your Own Sources

Modify the `sources` array:

```javascript
const sources = [
  {
    tagline: 'Your claim here',
    url: 'https://example.com/your-source'
  },
  // Add more sources...
];
```

### Adjusting Quality Threshold

Change the filtering criteria:

```javascript
const highQualityCards = cards.filter(card =>
  card.evaluation?.score >= 8.0  // Increase for stricter filtering
);
```

### Custom Highlight Colors

Modify the color logic:

```javascript
// Rainbow colors
const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'];
highlightColor: colors[index % colors.length]

// Topic-based colors
highlightColor: card.tagline.includes('climate') ? '#00FF00' : '#FFFF00'
```

## Output

Both examples generate:

- Console output with citation progress and scores
- `debate_cards.docx` file in the current directory
- Summary of all cards included

Example output:

```
=== Step 1: Citing Sources ===

Citing: "Climate change impacts are accelerating" from https://example.com/article
  ✓ Citation: Smith et al., 2024 (Nature)
  ✓ Quality Score: 8.5/10

Citing: "Renewable energy is cost-competitive" from https://example.com/energy
  ✓ Citation: Johnson, 2024 (Energy Policy)
  ✓ Quality Score: 7.2/10

3/3 cards meet quality threshold

=== Step 2: Generating Document ===
Generating document with 3 cards...
✓ Document saved to: debate_cards.docx

✓ Complete! Your debate cards are ready.
```

## Integration

These examples can be integrated into larger workflows:

- **Research automation:** Batch process reading lists
- **Debate prep tools:** Build evidence databases
- **Content management:** Auto-generate formatted documents
- **Quality assurance:** Filter sources by credibility scores
- **CI/CD pipelines:** Automated evidence extraction in build processes

## Error Handling

Both examples include comprehensive error handling:

- Invalid URLs or unreachable sources
- API rate limiting or timeouts
- Missing required fields
- Low-quality evidence filtering
- File system errors

## Performance

- **Parallel processing** for citation (up to 5-10 concurrent requests recommended)
- Typical processing time: 5-15 seconds per source
- Bulk document generation: < 2 seconds for dozens of cards

## Support

For questions or issues with these examples:

- Review the [API Documentation](../API.md)
- Check the [main README](../README.md)
- Open an issue on GitHub

## License

These examples are provided under the same license as the Evidex project (GPL).
