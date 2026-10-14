import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = process.argv[2];
const outputPath = process.argv[3];
const htmlPath = process.argv[4];
if (!sourceRoot || !outputPath || !htmlPath) {
  throw new Error('用法：node import-reference-data.mjs <参考仓库> <输出JSON> <当前index.html>');
}

const readJson = name => JSON.parse(fs.readFileSync(path.join(sourceRoot, 'data', name), 'utf8'));
const catalog = readJson('game-catalog.json');
const awakening = readJson('awakening.json');
const battleSkills = readJson('BattleSkill.json');
const html = fs.readFileSync(htmlPath, 'utf8');

const elementNames = {1:'金',2:'木',3:'水',4:'火',5:'土',6:'雷',7:'体',8:'邪'};
const qualityNames = {1:'green',2:'blue',3:'purple',4:'gold',5:'red'};
const formNames = {0:'bead',2:'sword',3:'music',4:'exotic',5:'shield',6:'spear',7:'blade',8:'hammer',9:'banner'};
const shapeById = new Map(catalog.shapes.map(shape => [shape.id, shape]));
const skillById = new Map(catalog.skills.map(skill => [skill.id, skill]));

const cleanText = value => String(value || '')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\r/g, '')
  .trim();

const artifacts = catalog.equips.map(equip => {
  const shape = shapeById.get(equip.shapeId);
  const base = Object.fromEntries((equip.base || []).map(row => [String(row.attr), row.value]));
  const normalSkills = (equip.skillIds || []).map(id => skillById.get(id)).filter(Boolean);
  const awaken = awakening[String(equip.id)] || null;
  const levels = awaken ? Object.fromEntries(Object.entries(awaken.levels || {}).map(([level, row]) => [level, {
    baseBonus: row.baseBonus || {},
    skillIds: row.skillIds,
    globalBuffs: row.globalBuffs || [],
    description: cleanText(row.description)
  }])) : {};
  return {
    id: equip.id,
    name: equip.name,
    element: elementNames[equip.element] || `属性${equip.element}`,
    quality: qualityNames[equip.quality] || 'green',
    tier: equip.tier,
    weaponForm: formNames[equip.weaponForm] || 'unknown',
    shapeId: equip.shapeId,
    cells: shape?.cells || [[0,0]],
    base: {
      attack: Number(base['2001']) || 0,
      defense: Number(base['2002']) || 0,
      hp: Number(base['2003']) || 0
    },
    resonance: equip.reson || 0,
    power: equip.power || 0,
    feature: cleanText(equip.feature),
    description: cleanText(equip.desc),
    skillIds: equip.skillIds || [],
    normalSkills: normalSkills.map(skill => ({
      id: skill.id,
      name: skill.name,
      description: cleanText(skill.desc),
      scope: skill.scope,
      elementMask: skill.elementMask,
      buffs: skill.buffs || []
    })),
    elder: equip.elder ? {
      id: equip.elder.id,
      name: equip.elder.name,
      quality: equip.elder.quality,
      starBonus: equip.elder.starBonus || []
    } : null,
    awakening: awaken ? {
      teacherId: awaken.teacherId,
      teacherName: awaken.teacherName,
      maxLevel: awaken.maxLevel,
      levels,
      missingEffects: awaken.missingEffects || []
    } : null
  };
});

const techniqueNames = [...html.matchAll(/\{value:'([^']+)', attribute:/g)].map(match => match[1]);
const aliases = {'求火焚心卷':'求火焚星卷','地龙震魄':'地龙震魄功','地龙镇破功':'地龙震魄功'};
const techniques = [...new Set(techniqueNames)].map(name => {
  const referenceName = aliases[name] || name;
  const rows = battleSkills
    .filter(skill => skill.szName === referenceName && skill.iType === 5)
    .sort((a,b) => a.iSkillID - b.iSkillID)
    .slice(0,5);
  if (!rows.length) return {name, referenceName, stars:[]};
  return {
    name,
    referenceName,
    stars: rows.map((skill,index) => ({
      star:index,
      skillId:skill.iSkillID,
      description:cleanText(skill.szDesc),
      cooldownFirst:skill.iCoolDownFirst || 0,
      cooldown:skill.iCoolDown || 0
    }))
  };
});

const output = {
  meta: {
    sourceUrl: 'https://hekunwang.github.io/laozu-solver/',
    sourceRepository: 'https://github.com/hekunwang/laozu-solver',
    sourceCommit: '3cac67d2b078c4cec9cefa0a314d33bde9695ec7',
    importedAt: '2026-10-14',
    resourceVersion: catalog.meta?.resourceVersion || '',
    awakeningCompleteCount: Number(catalog.meta?.awakeningCount) || 0,
    awakeningTotal: Number(catalog.meta?.awakeningTotal) || artifacts.filter(x => x.awakening).length,
    note: '0–3觉来自正式配置；4–5觉按参考项目说明属于先遣资源预适配，正式服开放后仍需核对。'
  },
  attributes: catalog.attrs,
  skills: catalog.skills.map(skill => ({
    id:skill.id,
    name:skill.name,
    description:cleanText(skill.desc),
    scope:skill.scope,
    elementMask:skill.elementMask,
    buffs:skill.buffs || []
  })),
  artifacts,
  techniques
};

fs.mkdirSync(path.dirname(outputPath), {recursive:true});
fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
console.log(JSON.stringify({artifacts:artifacts.length,awakening:artifacts.filter(x=>x.awakening).length,techniques:techniques.filter(x=>x.stars.length).length,output:outputPath}));
