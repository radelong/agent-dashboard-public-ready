# Project dashboard and document retrieval

A project portfolio dashboard with source-backed records, document control, queued agent tasks and a document submission/retrieval portal. This source copy starts with one generic example project. Original portfolio records, chat IDs, submitted documents, network storage and hosting identity are excluded.

Use Node.js 22 or later. Run `npm run build` to assemble the Worker. The included `.openai/hosting.example.json` has a deliberately unusable deployment identity and `BUCKET` binding. Configure your own private hosting, authentication, storage and access policies before deployment. No command here updates the original deployment.

Run `npm test` for Worker tests. Set `PYTHON_PATH` to a Python interpreter with pypdf, python-docx, python-pptx and openpyxl installed for extraction tests. JavaScript tests use in-memory storage; document-format tests use temporary synthetic files. Full semantic ingestion additionally requires the separately installed transformers dependency and local model runtime.

Document uploads preserve their original bytes and source locations. Retrieval returns project-scoped/shared passages with resolvable citations; vector embeddings and metadata remain private. Configure your own archive directory and local connection explicitly. No original SMB passwords or service tokens are included. The connection may control an installed Codex app-server, so connect only to your own authorized projects.

`scripts/prepare-records.mjs` writes into `./work/example-records` by default; `RECORDS_PATH` can select another explicitly chosen destination. It does not use the original production records folder.

First-party code has no newly assigned open-source license. Dependencies keep their original licenses and are not vendored in this source copy.
