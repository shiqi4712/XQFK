import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDataStore } from '../server/repository.mjs';

if (process.env.DATA_BACKEND !== 'mysql') {
  throw new Error('Set DATA_BACKEND=mysql and the DB_* variables before running this migration');
}

const projectDirectory = path.resolve(import.meta.dirname, '..');
const teachers = JSON.parse(await readFile(path.join(projectDirectory, 'server-data', 'teachers.json'), 'utf8'));
const students = JSON.parse(await readFile(path.join(projectDirectory, 'server-data', 'students.json'), 'utf8'));
const store = await createDataStore();

try {
  await store.initialize();
  const result = await store.importSnapshot(teachers, students);
  console.log(`Migrated ${result.teachers} teachers and ${result.students} students to MySQL`);
} finally {
  await store.close();
}
