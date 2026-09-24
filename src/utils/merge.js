import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP_ATTRS = ['position', 'normal', 'uv'];

/**
 * 合并静态几何体
 *
 * 城堡里有大量「一次建好就再也不动」的零件（立柱、台阶收边、金色装饰、塔顶……
 * 每一个还会带一个描边外壳），如果不处理就是几百次 draw call。
 * 这里把共享同一材质的静态网格烘焙成单个 BufferGeometry，
 * 描边外壳也按材质合并一次，通常能把成千的 draw call 压到个位数。
 *
 * 安全性：只合并显式列在白名单里的材质，并且跳过
 *   · InstancedMesh（本来就只有一次 draw call）
 *   · 需要逐帧改可见性 / 被射线检测引用 / 参与碰撞的网格
 *   · 没有 uv 或非索引化的几何体
 *
 * @param {THREE.Object3D} root        合并的根节点（其自身变换必须是单位矩阵）
 * @param {object} opts
 *   materials  {THREE.Material[]}  允许被合并的材质白名单
 *   skip       {(mesh) => boolean} 额外的排除规则
 *   label      合并后网格的命名前缀
 * @returns {{meshes: number, merged: number, outlines: number}}
 */
export function mergeStaticMeshes(root, { materials = [], skip = () => false, label = 'Static' } = {}) {
  if (!materials.length) return { meshes: 0, merged: 0, outlines: 0 };

  const allow = new Set(materials);
  root.updateMatrixWorld(true);

  /** material -> { geoms: [], objects: [] } */
  const buckets = new Map();
  const outlineBuckets = new Map();
  let scanned = 0;

  const collect = (obj) => {
    if (!obj.isMesh || obj.isInstancedMesh) return;
    if (obj.userData.noMerge) return;
    if (skip(obj)) return;

    const mat = obj.material;
    if (!allow.has(mat)) return;

    const g = obj.geometry;
    if (!g || !g.attributes?.position || !g.attributes?.normal || !g.attributes?.uv) return;
    if (!g.index) return;   // 混合索引/非索引会让 merge 失败，直接跳过

    const cloned = g.clone();
    for (const key of Object.keys(cloned.attributes)) {
      if (!KEEP_ATTRS.includes(key)) cloned.deleteAttribute(key);
    }
    cloned.applyMatrix4(obj.matrixWorld);

    if (!buckets.has(mat)) buckets.set(mat, { geoms: [], objects: [] });
    const b = buckets.get(mat);
    b.geoms.push(cloned);
    b.objects.push(obj);
    scanned++;

    // 描边外壳（子对象，局部矩阵为单位矩阵，因此世界矩阵与父级相同）
    const shell = obj.children.find((c) => c.name === '__outline');
    if (shell && shell.isMesh && allow.has(shell.material)) {
      const sg = g.clone();
      for (const key of Object.keys(sg.attributes)) {
        if (!KEEP_ATTRS.includes(key)) sg.deleteAttribute(key);
      }
      sg.applyMatrix4(shell.matrixWorld);
      if (!outlineBuckets.has(shell.material)) outlineBuckets.set(shell.material, { geoms: [], objects: [] });
      const ob = outlineBuckets.get(shell.material);
      ob.geoms.push(sg);
      ob.objects.push(shell);
    }
  };

  root.traverse(collect);

  let mergedCount = 0;
  let outlineCount = 0;

  const bake = (bucketMap, polygonOffset) => {
    let count = 0;
    for (const [mat, bucket] of bucketMap) {
      if (bucket.geoms.length < 2) {
        // 只有一个就别折腾了，保持原样
        bucket.geoms.forEach((g) => g.dispose());
        continue;
      }
      const geo = mergeGeometries(bucket.geoms, false);
      bucket.geoms.forEach((g) => g.dispose());
      if (!geo) continue;

      geo.computeBoundingSphere();
      geo.computeBoundingBox();

      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `${label}-merged`;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      root.add(mesh);

      for (const o of bucket.objects) {
        // 从原父级移除；描边外壳作为子对象会一并被移除
        o.removeFromParent();
      }
      count++;
    }
    return count;
  };

  mergedCount = bake(buckets);
  outlineCount = bake(outlineBuckets);

  return { meshes: scanned, merged: mergedCount, outlines: outlineCount };
}
