# Amino Cluster

A standalone interactive amino acid exploration app that uses PCA and chemical feature comparisons to reveal how residues cluster in property space.

## Stack
- React
- Vite
- 3Dmol.js
- Framer Motion
- Tailwind CSS

## Local development
```bash
npm install
npm run dev
```

## Live target
Deploy to `https://amino.eganegan.space`.

## Notes
- Amino acid data is stored in `src/data/aminoAcids.json`
- 3D residue previews are fetched live from the RCSB ligand archive
