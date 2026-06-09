# Repository Notes

This repository tracks the deployable source code for `My_Blog`.

Excluded intentionally:

- `frontend/dist*`: build artifacts; build locally and deploy the generated dist separately.
- `node_modules/`, Python virtualenvs and caches.
- runtime uploads/logs/temp packages.
- large Live2D/static runtime assets and article media should be managed separately if needed, preferably via object storage or Git LFS.
