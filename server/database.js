import { DatabaseSync } from 'node:sqlite';
/** @typedef {import('node:sqlite').SQLInputValue} SqlInput */
/** @typedef {Record<string,import('node:sqlite').SQLOutputValue>} SqlRow */
/** @typedef {{exec:(sql:string)=>void,prepare:(sql:string)=>{get:(...values:SqlInput[])=>SqlRow|undefined,all:(...values:SqlInput[])=>SqlRow[],run:(...values:SqlInput[])=>{changes:number|bigint,lastInsertRowid:number|bigint}},close:()=>void,transaction?:<T>(action:()=>T)=>T}} SqlDatabase */
/** @param {string|SqlDatabase} source @returns {SqlDatabase} */
export function database(source) {
  return typeof source === 'string' ? new DatabaseSync(source) : source;
}
/** Network I/O must finish before entering this synchronous transaction.
 * @template T @param {SqlDatabase} db @param {()=>T} action @returns {T} */
export function transaction(db, action) {
  if (db.transaction) return db.transaction(action);
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
