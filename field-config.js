/* field-config.js
 * 字段定义、关键词库与默认配置模板
 * 被 content script、popup、options 共用
 * 用 var 挂到全局，确保跨文件/跨环境可访问
 */
var FORM_FILLER = (() => {
  "use strict";

  /* ---------- 字段分类顺序 ---------- */
  const CATEGORIES = [
    "基本信息",
    "教育经历",
    "实习与项目经历",
    "获奖与证书",
    "求职意向",
    "其他信息",
  ];

  /* ---------- 字段定义 ----------
   * type: text | textarea | select | radio | checkbox
   * aliases: 用于匹配表单标签的关键词（不区分大小写，包含匹配）
   * options: select/radio 的可选值映射 { 配置值: [页面选项别名...] }
   */
  const FIELD_DEFS = {
    /* === 基本信息 === */
    name: {
      label: "姓名", category: "基本信息", type: "text",
      aliases: ["姓名", "名字", "真实姓名", "你的名字", "全名", "name", "fullname", "realname", "real name"],
    },
    gender: {
      label: "性别", category: "基本信息", type: "radio",
      aliases: ["性别", "gender", "sex"],
      options: { "男": ["男", "male", "m", "男性"], "女": ["女", "female", "f", "女性"] },
    },
    phone: {
      label: "手机号", category: "基本信息", type: "text",
      aliases: ["手机", "手机号", "手机号码", "电话", "联系电话", "联系方式", "mobile", "phone", "tel", "telephone", " cellphone", "手机号码"],
    },
    email: {
      label: "邮箱", category: "基本信息", type: "text",
      aliases: ["邮箱", "电子邮箱", "电子邮件", "e-mail", "email", "e mail", "mail", "邮件地址"],
    },
    idCard: {
      label: "身份证号", category: "基本信息", type: "text",
      aliases: ["身份证", "身份证号", "身份证号码", "证件号", "证件号码", "idcard", "id number", "identity"],
    },
    birthday: {
      label: "出生日期", category: "基本信息", type: "text",
      aliases: ["出生日期", "生日", "出生年月", "出生", "birthday", "birth", "date of birth", "dob"],
    },
    nation: {
      label: "民族", category: "基本信息", type: "text",
      aliases: ["民族", "族群", "nation", "ethnicity"],
    },
    politicalStatus: {
      label: "政治面貌", category: "基本信息", type: "select",
      aliases: ["政治面貌", "政治", "political"],
      options: {
        "中共党员": ["中共党员", "党员", "共产党员", "cpc member"],
        "中共预备党员": ["中共预备党员", "预备党员"],
        "共青团员": ["共青团员", "团员"],
        "群众": ["群众", "无党派"],
      },
    },
    nativePlace: {
      label: "籍贯", category: "基本信息", type: "text",
      aliases: ["籍贯", "祖籍", "native place", "origin"],
    },
    household: {
      label: "户籍所在地", category: "基本信息", type: "text",
      aliases: ["户籍", "户口", "户籍所在地", "户口所在地", "户口类型", "household"],
    },
    currentAddress: {
      label: "现居地址", category: "基本信息", type: "text",
      aliases: ["现居", "现住", "居住地", "现居地址", "现住地址", "通讯地址", "地址", "address", "current address"],
    },
    postcode: {
      label: "邮编", category: "基本信息", type: "text",
      aliases: ["邮编", "邮政编码", "postcode", "zipcode", "zip code", "postal code"],
    },
    wechat: {
      label: "微信号", category: "基本信息", type: "text",
      aliases: ["微信", "微信号", "wechat", "weixin"],
    },

    /* === 教育经历 === */
    school: {
      label: "毕业院校", category: "教育经历", type: "text",
      aliases: ["学校", "院校", "毕业院校", "就读院校", "就读学校", "大学", "school", "university", "college", "univ"],
    },
    major: {
      label: "所学专业", category: "教育经历", type: "text",
      aliases: ["专业", "所学专业", "就读专业", "major", "specialty", "specialization"],
    },
    degree: {
      label: "学历", category: "教育经历", type: "select",
      aliases: ["学历", "学位", "文化程度", "degree", "education", "qualification"],
      options: {
        "大专": ["大专", "专科", "高职", "college", "junior college"],
        "本科": ["本科", "学士", "bachelor", "undergraduate"],
        "硕士": ["硕士", "研究生", "master", "postgraduate"],
        "博士": ["博士", "doctor", "phd", "ph.d"],
      },
    },
    graduationYear: {
      label: "毕业年份", category: "教育经历", type: "text",
      aliases: ["毕业年份", "毕业年度", "毕业时间", "预计毕业", "graduation year", "graduate year"],
    },
    graduationDate: {
      label: "毕业日期", category: "教育经历", type: "text",
      aliases: ["毕业日期", "毕业年月", "graduation date"],
    },
    enrollmentYear: {
      label: "入学年份", category: "教育经历", type: "text",
      aliases: ["入学年份", "入学时间", "入学年度", "enrollment", "admission year"],
    },
    gpa: {
      label: "GPA/成绩", category: "教育经历", type: "text",
      aliases: ["gpa", "绩点", "成绩", "学分绩", "grade", "score"],
    },
    rank: {
      label: "专业排名", category: "教育经历", type: "text",
      aliases: ["排名", "专业排名", "年级排名", "rank", "ranking"],
    },

    /* === 实习与项目经历 === */
    internship: {
      label: "实习经历", category: "实习与项目经历", type: "textarea",
      aliases: ["实习", "实习经历", "实习经验", "实习工作", "internship", "intern", "实习描述"],
    },
    workExperience: {
      label: "工作经历", category: "实习与项目经历", type: "textarea",
      aliases: ["工作经历", "工作经验", "工作经历描述", "work experience", "work", "employment"],
    },
    projectExperience: {
      label: "项目经历", category: "实习与项目经历", type: "textarea",
      aliases: ["项目", "项目经历", "项目经验", "项目描述", "project", "project experience", "projects"],
    },
    researchExperience: {
      label: "科研经历", category: "实习与项目经历", type: "textarea",
      aliases: ["科研", "科研经历", "研究经历", "research", "research experience"],
    },

    /* === 获奖与证书 === */
    awards: {
      label: "获奖情况", category: "获奖与证书", type: "textarea",
      aliases: ["获奖", "获奖情况", "获奖经历", "荣誉", "荣誉奖项", "奖项", "award", "awards", "honor", "honors", "prize"],
    },
    certificates: {
      label: "证书", category: "获奖与证书", type: "text",
      aliases: ["证书", "资格证书", "职业证书", "证书情况", "certificate", "certification", "qualification"],
    },
    languages: {
      label: "语言能力", category: "获奖与证书", type: "text",
      aliases: ["语言", "语言能力", "外语", "外语水平", "language", "language ability", "english level"],
    },

    /* === 求职意向 === */
    jobIntention: {
      label: "求职意向", category: "求职意向", type: "text",
      aliases: ["求职意向", "期望职位", "应聘职位", "意向岗位", "应聘岗位", "期望工作", "意向职位", "job intention", "desired position", "position", "applied position"],
    },
    expectedCity: {
      label: "期望城市", category: "求职意向", type: "text",
      aliases: ["期望城市", "意向城市", "意向工作地", "期望工作地", "工作城市", "意向地点", "期望地点", "preferred city", "expected city", "work location", "city"],
    },
    expectedSalary: {
      label: "期望薪资", category: "求职意向", type: "text",
      aliases: ["期望薪资", "期望薪水", "期望月薪", "薪资要求", "期望薪酬", "salary", "expected salary", "desired salary"],
    },
    availability: {
      label: "到岗时间", category: "求职意向", type: "text",
      aliases: ["到岗时间", "入职时间", "可到岗时间", "最快到岗", "可入职时间", "available", "availability", "onboard date"],
    },
    acceptRelocation: {
      label: "是否接受调剂/外派", category: "求职意向", type: "radio",
      aliases: ["调剂", "接受调剂", "外派", "是否接受调剂", "是否接受外派", "relocation", "relocate", "willing to travel"],
      options: { "是": ["是", "接受", "同意", "yes", "y", "true"], "否": ["否", "不接受", "拒绝", "no", "n", "false"] },
    },

    /* === 其他信息 === */
    selfIntroduction: {
      label: "自我介绍", category: "其他信息", type: "textarea",
      aliases: ["自我介绍", "个人简介", "自我评价", "个人评价", "自我描述", "self introduction", "self evaluation", "summary", "about me", "profile"],
    },
    hobby: {
      label: "兴趣爱好", category: "其他信息", type: "text",
      aliases: ["兴趣", "爱好", "兴趣爱好", "特长", "hobby", "interest", "hobbies"],
    },
    skills: {
      label: "专业技能", category: "其他信息", type: "textarea",
      aliases: ["技能", "专业技能", "技能特长", "个人技能", "技术栈", "skill", "skills", "technical skills"],
    },
    emergencyContact: {
      label: "紧急联系人", category: "其他信息", type: "text",
      aliases: ["紧急联系人", "紧急联系", "emergency contact"],
    },
    emergencyPhone: {
      label: "紧急联系电话", category: "其他信息", type: "text",
      aliases: ["紧急联系电话", "紧急人电话", "emergency phone"],
    },
    additionalInfo: {
      label: "补充说明", category: "其他信息", type: "textarea",
      aliases: ["补充", "补充说明", "其他说明", "备注", "备注信息", "其他", "additional", "remark", "comment", "note"],
    },
  };

  /* ---------- 默认配置模板 ---------- */
  function createDefaultProfile() {
    return {
      id: "profile_" + Date.now(),
      name: "默认配置",
      data: {
        name: "",
        gender: "",
        phone: "",
        email: "",
        idCard: "",
        birthday: "",
        nation: "汉族",
        politicalStatus: "共青团员",
        nativePlace: "",
        household: "",
        currentAddress: "",
        postcode: "",
        wechat: "",
        school: "",
        major: "",
        degree: "本科",
        graduationYear: "",
        graduationDate: "",
        enrollmentYear: "",
        gpa: "",
        rank: "",
        internship: "",
        workExperience: "",
        projectExperience: "",
        researchExperience: "",
        awards: "",
        certificates: "",
        languages: "",
        jobIntention: "",
        expectedCity: "",
        expectedSalary: "",
        availability: "随时",
        acceptRelocation: "是",
        selfIntroduction: "",
        hobby: "",
        skills: "",
        emergencyContact: "",
        emergencyPhone: "",
        additionalInfo: "",
      },
    };
  }

  return { CATEGORIES, FIELD_DEFS, createDefaultProfile };
})();
