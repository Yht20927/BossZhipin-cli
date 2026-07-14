-- BOSS CLI Job Export — 2026-07-14T01:12:52.152Z
-- 用法: sqlite3 jobs.db < python-mrjyiqwn.sql

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jobName TEXT, salaryDesc TEXT, jobExperience TEXT, jobDegree TEXT,
  cityName TEXT, areaDistrict TEXT, brandName TEXT, brandStageName TEXT,
  brandScaleName TEXT, brandIndustry TEXT, skills TEXT,
  bossName TEXT, bossTitle TEXT, securityId TEXT,
  encryptJobId TEXT UNIQUE, encryptBossId TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR REPLACE INTO jobs (jobName,salaryDesc,jobExperience,jobDegree,cityName,areaDistrict,brandName,brandStageName,brandScaleName,brandIndustry,skills,bossName,bossTitle,securityId,encryptJobId,encryptBossId) VALUES ('Python','13-26K·14薪','经验不限','本科','杭州','滨江区','上海万宝盛华信息科技','','500-999人','人力资源服务','Python, C++, C, Java, Django, Flask, Tornado, MySQL, Redis, Oracle, 云计算经验, 运维开发经验, 爬虫经验','李女士','招聘者','nCBy_uyMChLo3-u1fdTGf1cvjAGd3teOnG3G6_X72s7CRSVgbck9axb0znJGlPz6mUlUDD1Nm2tc_hP8HdaYMsaIFUxlBNWKcyXNLHCM_CsrEedZNLwGh7EFu57MNCe_SckG10IZ1K91K-p0gh_wSUjiNi0847vme5xxUlXSanw02dHKlQ51f8WXlo-ehZdm9O_o225-hDwg6BpplgdHj5Rnx0qUZ4_4O-uKkl_gsbjlqV6aUbRxOu5QHn-XeNZqGj-jaGFmxLVRhQhSGGh18ObwxxTW6iRUA4X1AhgCxSwuZg5q4f1z0yn1Axm8fPfcSVuEdCX5ogha-I_Lt3tK_GCi_cZJtXkXuVzmjKU6gcFX23bz-9pJxlJYYTQe','27245d8a9c7152900nF-2d6-EFRT','c342991c731ce9450Xx42N2-FFpY');
INSERT OR REPLACE INTO jobs (jobName,salaryDesc,jobExperience,jobDegree,cityName,areaDistrict,brandName,brandStageName,brandScaleName,brandIndustry,skills,bossName,bossTitle,securityId,encryptJobId,encryptBossId) VALUES ('Python','8-10K','经验不限','本科','怀化','鹤城区','怀化亿米信息技术','不需要融资','20-99人','计算机服务','爬虫经验, Django, MySQL, Python','白洪鈺','招聘者','gwfeGdGhqeTb3-h19slULVHEsh8hxy-jfxqfIopKGVHeuJzrEqBHZaLhzY83KNM47Afcm7Il0gEjdH-NuA9bu0ABCTLz2BsJdh46-G4N5Rcc9quMQGZLH3pf3TGWiGDY8pKYQ0dL2zvjlSzhJaJldamZe3UkwMi4jy7K_co-R_AYYQZ_axytjtAExbyM9n_KNGpokQNJFf0VMabcJglz6HOuS2EPIRxgjvhmbqLm-zQilbciWbLfWkS_MMijs7sb6MkbGfp-qEXk1YpQxX4RayT48g3bXxtFgNajdCuVFBHu8SBdvuP7u2PF5uNKZsZhec9hLirNoC89gjJxnmDJtoqo-p5M4mZ63oI~','85945bcafc1290470nF83Nq0EVNX','536047d5c7b538df0n172t2-EVdR');
INSERT OR REPLACE INTO jobs (jobName,salaryDesc,jobExperience,jobDegree,cityName,areaDistrict,brandName,brandStageName,brandScaleName,brandIndustry,skills,bossName,bossTitle,securityId,encryptJobId,encryptBossId) VALUES ('python实习生','5-8K','在校/应届','大专','南平','建阳区','南平市建阳区瑞晨...','','0-20人','计算机服务','Python, Django, MySQL, 团队管理经验','叶彬','HR','xwZsHRHu9L7b7-j1GFt1V4XNzAN7eZpunjWHwuSVImCvQJN5lV6AfzEXPIGp-m9v7u7vR1MaIIhIlmCN8EcKNtBMwQVsv8IOLHBDrMZ08IDoc72xCpbsfAVKOG7EbvtU5Uspu9rhdOXTjGmKSvpzFkmatzZ35dZYOt_Y8aFfEz__fvRXZwCPF3zko0oAjvqo0ads31GeJyi4evTo3Esarrh4hISlAwNQQRAL6yHK0QgMlGOD_G8BPTyNLWqXctaWFZdRdi1i1BVcIJeRY42Lq9fJQWcGwPdZoy0gGedcuy-mANRn40qX0RLuBVxswS89EiZWG65s7mjjQUV2Bt5_ErXG2NpZe8cgPz0~','d04a5fcc4ffe888b0nd_39m7GFFX','9ed9774d9d927d1c0nx529--GFpQ');