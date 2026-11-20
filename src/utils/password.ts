export interface PasswordRuleStatus {
  minLength: boolean;
  noSpaces: boolean;
  hasLetter: boolean;
  hasDigit: boolean;
  hasSpecial: boolean;
}

export function evaluatePasswordRules(pwd: string): PasswordRuleStatus {
  return {
    minLength: pwd.length > 8,
    noSpaces: pwd.length > 0 && !/\s/.test(pwd),
    hasLetter: /[a-zA-Z]/.test(pwd),
    hasDigit: /[0-9]/.test(pwd),
    hasSpecial: /[^a-zA-Z0-9\s]/.test(pwd),
  };
}

export function validateTelnetPassword(pwd: string): string | null {
  if (pwd.length <= 8) {
    return `密码长度必须大于 8 位（当前 ${pwd.length} 位）`;
  }
  if (/\s/.test(pwd)) {
    return "密码不能包含空格";
  }
  if (!/[a-zA-Z]/.test(pwd)) {
    return "密码必须包含至少一个英文字母";
  }
  if (!/[0-9]/.test(pwd)) {
    return "密码必须包含至少一个数字";
  }
  if (!/[^a-zA-Z0-9\s]/.test(pwd)) {
    return "密码必须包含至少一个特殊字符（如 %、#、*、@ 等）";
  }
  return null;
}
