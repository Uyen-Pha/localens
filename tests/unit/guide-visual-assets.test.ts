import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('ships the guide banner as a valid WebP so the profile and calendar hero can load',()=>{
 const bytes=readFileSync('public/images/guide/guide-bay-banner.webp');
 expect(bytes.subarray(0,4).toString()).toBe('RIFF');
 expect(bytes.subarray(8,12).toString()).toBe('WEBP');
});
