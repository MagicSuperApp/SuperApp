/**
 * Stub cho asset nhị phân (.glb/.gltf) trong môi trường Jest.
 *
 * Trong app, Metro biến `require('....glb')` thành một ID ASSET dạng SỐ. Jest không
 * có bước đó nên sẽ cố parse tệp nhị phân như mã nguồn và nổ. Trả về một số để
 * `treeModels.ts` import được, và để `isFileBacked()` vẫn nhận ra "model có tệp".
 *
 * Số cụ thể không quan trọng — không test nào phụ thuộc vào giá trị này.
 */
module.exports = 1;
