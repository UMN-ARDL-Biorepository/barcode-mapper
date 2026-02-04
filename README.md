# Biospecimen Barcode Mapper

A modern, single-page React application for associating Patient IDs with barcode ranges in biospecimen CSV data.

## Features

- **CSV Data Ingestion**: Drag and drop support for scanning files.
- **Range Mapping**: Define start/end tube numbers and assign them to a Patient ID.
- **Auto-Detection**: Intelligent detection of barcode columns.
- **Visual Feedback**: Real-time preview of mapped data.
- **Export**: Download the enriched dataset as a new CSV.
- **Aesthetic Design**: Glassmorphism UI with dark mode support.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)

### Installation

1. Clone or navigate to the directory.
2. Install dependencies:
   ```bash
   bun install
   ```

### Running the App

Start the development server:

```bash
bun run dev
```

Open your browser to `http://localhost:5173`.

## Development

### Pre-commit Hooks

This project uses `prek` for pre-commit hooks to ensure code quality. Prek is a fast, Rust-based tool that runs via `bunx` - no separate installation required!

#### Installing Git Hooks

After running `bun install`, the git hooks are automatically installed. To manually install them:

```bash
bun run prepare
```

Or directly:

```bash
bunx @j178/prek install
```

#### Running Hooks Manually

To run all hooks on all files:

```bash
bun run prek run --all-files
```

Or directly:

```bash
bunx @j178/prek run --all-files
```

#### What Gets Checked

The pre-commit hooks will automatically:

- ✨ Remove trailing whitespace
- 📝 Fix end-of-file issues
- ✅ Validate YAML and JSON files
- 🔍 Detect large files
- 🎨 Format code with Prettier
- 🔧 Lint JavaScript/React with ESLint

## Usage

1. Drag and drop your CSV file into the "Source Data" box.
2. Confirm the correct "TubeNumber Column" is selected.
3. In the "Patient Mapping" panel, enter a range of tube numbers (e.g., Start: 100, End: 200) and the corresponding Patient ID (e.g., P-001).
4. Click "Add Mapping Rule".
5. View the mapped results in the table on the right.
6. Click "Export CSV" in the header to save your work.
