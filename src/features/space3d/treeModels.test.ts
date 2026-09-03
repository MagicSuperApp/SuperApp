import {
  DEFAULT_TREE_MODEL_ID, POINTS_TREE_MODEL_ID, PROCEDURAL_TREE_MODEL_ID,
  TREE_MODELS, getTreeModel, isFileBacked, isPointCloud, treeModelKind,
} from './treeModels';

describe('sổ đăng ký TREE_MODELS', () => {
  it('id không được TRÙNG (id là khoá lưu xuống máy theo từng cây)', () => {
    const ids = TREE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id không rỗng và không có khoảng trắng thừa', () => {
    for (const m of TREE_MODELS) {
      expect(m.id.length).toBeGreaterThan(0);
      expect(m.id).toBe(m.id.trim());
    }
  });

  it('model nào cũng có nhãn hiển thị', () => {
    for (const m of TREE_MODELS) {
      expect(m.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('model mặc định TỒN TẠI, là cây điểm từ OriLife, và không cần tệp đóng gói', () => {
    const def = TREE_MODELS.find((m) => m.id === DEFAULT_TREE_MODEL_ID);
    expect(def).toBeDefined();
    expect(DEFAULT_TREE_MODEL_ID).toBe(POINTS_TREE_MODEL_ID);
    expect(isPointCloud(def!)).toBe(true);
    expect(isFileBacked(def!)).toBe(false);
  });

  it('cây tự tạo VẪN còn trong sổ — nó là chỗ rơi về khi cây chưa dựng 3D', () => {
    const def = TREE_MODELS.find((m) => m.id === PROCEDURAL_TREE_MODEL_ID);
    expect(def).toBeDefined();
    expect(treeModelKind(def!)).toBe('procedural');
    expect(isFileBacked(def!)).toBe(false);
  });

  it('mọi model .glb cũ vẫn giữ nguyên trong sổ (đổi mặc định KHÔNG gỡ model nào)', () => {
    // Người dùng đã chọn tay model nào thì lựa chọn đó nằm trong treeModelStore.
    // Gỡ một id khỏi sổ = mọi cây đang dùng nó lặng lẽ rơi về mặc định.
    const fileIds = TREE_MODELS.filter(isFileBacked).map((m) => m.id);
    expect(fileIds).toEqual(expect.arrayContaining([
      'tree1', 'tree_broadleaf', 'tree_zsky_a', 'tree_zsky_b', 'palm_tree',
      'fiddle_leaf_plant', 'yucca_plant', 'bush',
      'houseplant_bushy', 'houseplant_slim',
    ]));
  });

  it('model có tệp phải kèm source thật (require đã resolve)', () => {
    for (const m of TREE_MODELS.filter(isFileBacked)) {
      expect(m.source).not.toBeNull();
      expect(m.source).toBeDefined();
    }
  });
});

describe('getTreeModel', () => {
  it('tra đúng model theo id', () => {
    for (const m of TREE_MODELS) {
      expect(getTreeModel(m.id).id).toBe(m.id);
    }
  });

  it('id lạ → rơi về mặc định thay vì undefined (model bị gỡ khỏi sổ vẫn không nổ)', () => {
    expect(getTreeModel('khong-ton-tai').id).toBe(DEFAULT_TREE_MODEL_ID);
  });

  it('null/undefined/rỗng → mặc định', () => {
    expect(getTreeModel(null).id).toBe(DEFAULT_TREE_MODEL_ID);
    expect(getTreeModel(undefined).id).toBe(DEFAULT_TREE_MODEL_ID);
    expect(getTreeModel('').id).toBe(DEFAULT_TREE_MODEL_ID);
  });
});

describe('isFileBacked', () => {
  it('phân biệt đúng model có tệp và model không tệp', () => {
    expect(isFileBacked({ id: 'a', label: 'a', source: null })).toBe(false);
    expect(isFileBacked({ id: 'b', label: 'b', source: 123 })).toBe(true);
    // Cây điểm cũng không có tệp đóng gói — nó tải từ máy chủ.
    expect(isFileBacked({ id: 'c', label: 'c', source: null, kind: 'points' })).toBe(false);
  });
});

describe('treeModelKind / isPointCloud', () => {
  it('bản ghi không khai `kind` thì suy từ `source` (giữ sổ cũ chạy được)', () => {
    expect(treeModelKind({ id: 'a', label: 'a', source: null })).toBe('procedural');
    expect(treeModelKind({ id: 'b', label: 'b', source: 123 })).toBe('file');
  });

  it('`kind` khai rõ thì thắng — cây điểm không có tệp nhưng KHÔNG phải cây tự tạo', () => {
    const points = { id: 'c', label: 'c', source: null, kind: 'points' as const };
    expect(treeModelKind(points)).toBe('points');
    expect(isPointCloud(points)).toBe(true);
    expect(isPointCloud({ id: 'd', label: 'd', source: null })).toBe(false);
  });
});
