import {
  DEFAULT_TREE_MODEL_ID, TREE_MODELS, getTreeModel, isFileBacked,
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

  it('model mặc định TỒN TẠI và là cây tự tạo (không cần tệp → luôn hiện được)', () => {
    const def = TREE_MODELS.find((m) => m.id === DEFAULT_TREE_MODEL_ID);
    expect(def).toBeDefined();
    expect(isFileBacked(def!)).toBe(false);
  });

  it('id là KHOÁ LƯU XUỐNG MÁY — khoá đúng vài id đã phát hành', () => {
    // treeModelStore ghi nguyên chuỗi id vào AsyncStorage theo từng cây, nên đổi
    // id = viết lại lựa chọn cũ của nông dân mà không ai thấy. Ngày 06/08
    // (`f14f17a`) id `procedural` bị chuyển từ cây tự tạo sang tệp tree1.glb.
    // Ba dòng dưới là để lần sau việc đó gãy ở đây chứ không gãy ngoài vườn.
    const byId = Object.fromEntries(TREE_MODELS.map((m) => [m.id, m]));
    expect(byId.procedural?.source).toBeNull();
    expect(byId.tree1?.source).not.toBeNull();
    expect(DEFAULT_TREE_MODEL_ID).toBe('procedural');
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
  it('phân biệt đúng model có tệp và cây tự tạo', () => {
    expect(isFileBacked({ id: 'a', label: 'a', source: null })).toBe(false);
    expect(isFileBacked({ id: 'b', label: 'b', source: 123 })).toBe(true);
  });
});
