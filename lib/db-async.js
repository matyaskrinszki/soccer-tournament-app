// Promise wrappers around the callback-based sqlite3 API, so routes can use async/await.
// (Same helpers as the ones defined locally in app/api/admin/generate-schedule/route.js.)

export function dbGet(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

export function dbAll(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows || []);
        });
    });
}

export function dbRun(db, query, params = []) {
    return new Promise((resolve, reject) => {
        // Regular function (not arrow) so sqlite3 can set `this.lastID` / `this.changes`
        db.run(query, params, function (err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// Runs one or more SQL statements without parameters (DDL, transactions, PRAGMA writes).
export function dbExec(db, sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}
