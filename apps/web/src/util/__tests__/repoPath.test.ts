import { describe, it, expect } from 'vitest';
import { repoPathFromInput } from '../repoPath';

describe('repoPathFromInput', () => {
  it('reads a pasted host URL with or without .git', () => {
    expect(repoPathFromInput('https://gitee.com/yajundu/GZGS-CTEX2027.git')).toBe('yajundu/GZGS-CTEX2027');
    expect(repoPathFromInput('https://github.com/octocat/hello')).toBe('octocat/hello');
    expect(repoPathFromInput('http://gitlab.example.org/grp/sub/paper/')).toBe('grp/sub/paper');
  });

  it('reads a bare path, two or three segments', () => {
    expect(repoPathFromInput(' owner/repo ')).toBe('owner/repo');
    expect(repoPathFromInput('grp/sub/paper')).toBe('grp/sub/paper');
  });

  it('a plain filter word is not a path', () => {
    expect(repoPathFromInput('thesis')).toBeNull();
    expect(repoPathFromInput('')).toBeNull();
    expect(repoPathFromInput('   ')).toBeNull();
    expect(repoPathFromInput('https://gitee.com')).toBeNull(); // host alone, no path
  });
});
