import { createDataStore, createTeacherId } from '../server/repository.mjs';
import { hashPassword } from '../server/security.mjs';

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const [rawKey, inlineValue] = value.slice(2).split('=', 2);
    options[rawKey] = inlineValue ?? values[index + 1];
    if (inlineValue == null) index += 1;
  }
  return options;
}

function requireOption(options, name) {
  const value = String(options[name] || '').trim();
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

const [command] = process.argv.slice(2);
const options = parseArguments(process.argv.slice(3));
const store = await createDataStore();

try {
  await store.initialize();

  if (command === 'list') {
    console.table(await store.listTeachers());
  } else if (command === 'create') {
    const account = requireOption(options, 'account').toLowerCase();
    const displayName = requireOption(options, 'name');
    const password = String(process.env.TEACHER_PASSWORD || '');
    if (!password) throw new Error('Set TEACHER_PASSWORD before creating a teacher');
    const credentials = await hashPassword(password);
    const teacher = await store.createTeacher({
      teacherId: createTeacherId(),
      account,
      displayName,
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
    });
    console.log(`Created teacher ${teacher.displayName} (${teacher.account}, ${teacher.teacherId})`);
  } else if (command === 'enable' || command === 'disable') {
    const account = requireOption(options, 'account').toLowerCase();
    const teacher = await store.setTeacherActive(account, command === 'enable');
    console.log(`${teacher.account} is now ${teacher.active ? 'enabled' : 'disabled'}`);
  } else if (command === 'reset') {
    const account = requireOption(options, 'account').toLowerCase();
    const password = String(process.env.TEACHER_PASSWORD || '');
    if (!password) throw new Error('Set TEACHER_PASSWORD before resetting a password');
    const teacher = await store.getTeacherByAccount(account);
    if (!teacher) throw new Error('Teacher account not found');
    const credentials = await hashPassword(password);
    await store.updateTeacherPassword(teacher.teacherId, credentials.salt, credentials.hash);
    console.log(`Password reset for ${teacher.account}`);
  } else {
    throw new Error('Usage: npm run teacher -- <list|create|enable|disable|reset> [--account value] [--name value]');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await store.close();
}
