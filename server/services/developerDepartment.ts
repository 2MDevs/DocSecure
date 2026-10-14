import { pool } from '../db';

/**
 * O Desenvolvedor faz parte do setor de Tecnologia da Informação (TI).
 * Este módulo garante que todo usuário com perfil DEVELOPER esteja vinculado ao setor de TI
 * cadastrado (mesmo que o setor tenha sido recriado e ganhado outro identificador).
 */
type Dept = { id: string; name: string };
let cache: { at: number; dept: Dept | null } | null = null;

export function invalidateTIDepartmentCache() {
  cache = null;
}

/** Encontra o setor de TI: código "TI" ou nome "Tecnologia da Informação" / "TI". */
export async function findTIDepartment(): Promise<Dept | null> {
  if (cache && Date.now() - cache.at < 30_000) return cache.dept;
  let dept: Dept | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM departments
        WHERE UPPER(TRIM(code)) = 'TI'
           OR name ILIKE 'tecnologia%'
           OR name ~* '(^|[^[:alnum:]])TI([^[:alnum:]]|$)'
        ORDER BY (UPPER(TRIM(code)) = 'TI') DESC, (name ILIKE 'tecnologia%') DESC, id ASC
        LIMIT 1`
    );
    dept = rows[0] ? { id: rows[0].id, name: rows[0].name } : null;
  } catch (e) {
    console.warn('[DEV→TI] Não foi possível localizar o setor de TI:', (e as Error).message);
  }
  cache = { at: Date.now(), dept };
  return dept;
}

/** Vincula todos os desenvolvedores ao setor de TI (rodado ao iniciar e quando setores mudam). */
export async function syncDevelopersToTI(): Promise<void> {
  invalidateTIDepartmentCache();
  const ti = await findTIDepartment();
  if (!ti) return;
  try {
    const { rowCount } = await pool.query(
      `UPDATE users SET department_id = $1, department_name = $2
        WHERE UPPER(role) = 'DEVELOPER' AND (department_id IS DISTINCT FROM $1 OR department_name IS DISTINCT FROM $2)`,
      [ti.id, ti.name]
    );
    if (rowCount) console.log(`[DEV→TI] ${rowCount} desenvolvedor(es) vinculado(s) ao setor ${ti.name}.`);
  } catch (e) {
    console.warn('[DEV→TI] Falha ao vincular desenvolvedores ao setor de TI:', (e as Error).message);
  }
}

/** Ajusta (e grava) o setor de um usuário desenvolvedor carregado do banco. */
export async function applyDeveloperDepartment(row: any): Promise<any> {
  if (!row || String(row.role || '').toUpperCase() !== 'DEVELOPER') return row;
  const ti = await findTIDepartment();
  if (!ti || (row.department_id === ti.id && row.department_name === ti.name)) return row;
  try {
    await pool.query('UPDATE users SET department_id = $1, department_name = $2 WHERE id = $3', [ti.id, ti.name, row.id]);
  } catch {}
  row.department_id = ti.id;
  row.department_name = ti.name;
  return row;
}
