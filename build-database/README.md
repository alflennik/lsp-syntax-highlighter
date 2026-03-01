# Rebuilding The Database

Ensure python3 is installed.
Ensure node is installed.

Open a terminal in the build-database folder.

Run `npm install`.

Install Python dependencies.

Run `python3 -m venv .venv` to set up a virtual environment.

On Mac or Linux, run `source .venv/bin/activate`, and on Windows run `.venv\Scripts\activate` to activate the environment.

Run `pip install -r requirements.txt` to finish the install process.

Run `python3 step-1-seed-database.py`

A `data.db` file should appear, which contains a sqlite database.

Run `node step-2-populate-colors.js`

This will populate the database with color outputs.

Run `python3 step-3-cluster.py`

If you see `ModuleNotFoundError: No module named 'numpy'`, you might need to activate the environment (see above).

This clusters the data into 300 clusters using the kmedoids fasterPAM algorithm, populating the cluster_scope_id for each scope.

Run `node step-4-finalize.js`
