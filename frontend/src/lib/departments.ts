type DepartmentLike = { code?: string | null; name?: string | null }

export function isAiDsDepartment(department: DepartmentLike) {
  return /ai.?ds|artificial intelligence/i.test(`${department.code ?? ''} ${department.name ?? ''}`)
}

export function findAiDsDepartment<T extends DepartmentLike>(departments: T[]) {
  return departments.find(isAiDsDepartment) ?? departments[0]
}
