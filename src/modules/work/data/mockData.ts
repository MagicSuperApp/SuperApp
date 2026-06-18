// modules/work/data/mockData.ts
// Mock data for Work module — sẽ thay bằng API thật khi backend Work module sẵn sàng.

export interface JobCategory {
  id: string;
  name: string;
  icon: string;
  count: number;
  color: string;
}

export interface Job {
  id: string;
  title: string;
  category: string;
  categoryId: string;
  budget: number;
  budgetUnit: 'VND' | 'USD';
  location: string;
  district: string;
  postedAt: string;
  deadline: string;
  postedBy: {
    name: string;
    avatar: string;
    rating: number;
    verified: boolean;
  };
  description: string;
  requirements: string[];
  applicantCount: number;
  isUrgent?: boolean;
  isFeatured?: boolean;
}

export interface Worker {
  id: string;
  name: string;
  avatar: string;
  title: string;
  rating: number;
  reviewCount: number;
  completedJobs: number;
  hourlyRate: number;
  location: string;
  skills: string[];
  verified: boolean;
  online: boolean;
  bio: string;
  yearsExperience: number;
}

export const CATEGORIES: JobCategory[] = [
  { id: 'construction',  name: 'Xây dựng',     icon: 'hammer',                  count: 247, color: '#E08C3A' },
  { id: 'repair',        name: 'Sửa chữa',     icon: 'wrench',                  count: 183, color: '#3D7A5E' },
  { id: 'transport',     name: 'Vận chuyển',   icon: 'truck-outline',           count: 156, color: '#3B6EA8' },
  { id: 'housekeeping',  name: 'Giúp việc',    icon: 'broom',                   count: 142, color: '#8B5BC4' },
  { id: 'it',            name: 'IT · Văn phòng', icon: 'laptop',                count: 98,  color: '#264E7E' },
  { id: 'event',         name: 'Sự kiện',      icon: 'party-popper',            count: 67,  color: '#C0533A' },
  { id: 'creative',      name: 'Sáng tạo',     icon: 'palette-outline',         count: 89,  color: '#B07D2F' },
  { id: 'beauty',        name: 'Làm đẹp',      icon: 'face-woman-shimmer',      count: 74,  color: '#D8569E' },
  { id: 'driver',        name: 'Tài xế',       icon: 'car',                     count: 112, color: '#0F1614' },
  { id: 'tutor',         name: 'Gia sư',       icon: 'school-outline',          count: 53,  color: '#3D7A5E' },
];

export const FEATURED_JOBS: Job[] = [
  {
    id: 'j-001',
    title: 'Cần thợ điện đi đường dây cho nhà 3 tầng — Quận 7',
    category: 'Sửa chữa',
    categoryId: 'repair',
    budget: 3500000,
    budgetUnit: 'VND',
    location: 'TP. Hồ Chí Minh',
    district: 'Quận 7',
    postedAt: '2 giờ trước',
    deadline: '15/05/2026',
    postedBy: {
      name: 'Anh Tuấn',
      avatar: 'https://i.pravatar.cc/150?img=12',
      rating: 4.8,
      verified: true,
    },
    description:
      'Nhà mới xây 3 tầng cần thợ điện kéo dây toàn bộ — gồm dây nguồn, dây mạng, ổ cắm và công tắc cho 12 phòng. Ưu tiên thợ có kinh nghiệm 3 năm trở lên, có hợp đồng số ký bằng PhoenixKey để đảm bảo bảo hành 12 tháng.',
    requirements: [
      'Kinh nghiệm ≥ 3 năm',
      'Có CMND/CCCD đã xác thực',
      'Cam kết bảo hành 12 tháng',
      'Tự chuẩn bị dụng cụ',
    ],
    applicantCount: 12,
    isUrgent: true,
    isFeatured: true,
  },
  {
    id: 'j-002',
    title: 'Tìm tài xế xe tải 1.5T chở hàng nội thành — gấp',
    category: 'Vận chuyển',
    categoryId: 'transport',
    budget: 800000,
    budgetUnit: 'VND',
    location: 'TP. Hồ Chí Minh',
    district: 'Quận Tân Bình',
    postedAt: '45 phút trước',
    deadline: '14/05/2026',
    postedBy: {
      name: 'Cty Bao Bì Phương Nam',
      avatar: 'https://i.pravatar.cc/150?img=33',
      rating: 4.9,
      verified: true,
    },
    description:
      'Cần tài xế xe tải 1.5T chở 30 thùng giấy carton từ kho Tân Bình đến chợ Bình Tây. Tổng quãng đường ~15km. Thanh toán qua escrow ngay khi giao hàng xong.',
    requirements: [
      'Có bằng C trở lên',
      'Xe tải riêng hoặc thuê',
      'Sẵn sàng đi trong 2 giờ tới',
    ],
    applicantCount: 4,
    isUrgent: true,
  },
  {
    id: 'j-003',
    title: 'Thiết kế logo + bộ nhận diện cho thương hiệu cà phê',
    category: 'Sáng tạo',
    categoryId: 'creative',
    budget: 15000000,
    budgetUnit: 'VND',
    location: 'Hà Nội',
    district: 'Quận Đống Đa',
    postedAt: '5 giờ trước',
    deadline: '30/05/2026',
    postedBy: {
      name: 'Chị Linh',
      avatar: 'https://i.pravatar.cc/150?img=47',
      rating: 5.0,
      verified: true,
    },
    description:
      'Thương hiệu cà phê đặc sản Việt Nam (origin: Sơn La) cần thiết kế trọn bộ: logo, bao bì 250g/500g, thẻ name card, signage cửa hàng. Phong cách: tối giản, văn hóa Việt, có yếu tố H\'Mông.',
    requirements: [
      'Portfolio tối thiểu 5 dự án F&B',
      'Bàn giao file gốc AI/PSD',
      'Sửa không giới hạn trong 2 vòng',
      'Sở hữu trí tuệ chuyển 100% cho khách',
    ],
    applicantCount: 23,
    isFeatured: true,
  },
  {
    id: 'j-004',
    title: 'Cần người giúp việc nhà theo giờ — 4h/tuần',
    category: 'Giúp việc',
    categoryId: 'housekeeping',
    budget: 70000,
    budgetUnit: 'VND',
    location: 'TP. Hồ Chí Minh',
    district: 'Quận 2',
    postedAt: '1 ngày trước',
    deadline: '20/05/2026',
    postedBy: {
      name: 'Chị Hoa',
      avatar: 'https://i.pravatar.cc/150?img=20',
      rating: 4.7,
      verified: true,
    },
    description:
      'Nhà 2 vợ chồng + 1 em bé, căn hộ 80m². Cần dọn vệ sinh + giặt ủi 4 giờ/tuần, sáng Thứ 7. Có thiết bị đầy đủ, chỉ cần người chăm chỉ và tin cậy.',
    requirements: [
      'Sạch sẽ, cẩn thận với đồ trẻ em',
      'Có CMND đã xác thực Aladin',
      'Cam kết tối thiểu 3 tháng',
    ],
    applicantCount: 8,
  },
  {
    id: 'j-005',
    title: 'Sửa máy lạnh Daikin không lạnh — Quận Cầu Giấy',
    category: 'Sửa chữa',
    categoryId: 'repair',
    budget: 500000,
    budgetUnit: 'VND',
    location: 'Hà Nội',
    district: 'Quận Cầu Giấy',
    postedAt: '3 giờ trước',
    deadline: '14/05/2026',
    postedBy: {
      name: 'Anh Minh',
      avatar: 'https://i.pravatar.cc/150?img=68',
      rating: 4.6,
      verified: false,
    },
    description:
      'Máy lạnh Daikin 1HP hoạt động bình thường nhưng không lạnh. Đã thử bật chế độ Cool, nhiệt độ 16°C nhưng vẫn không lạnh. Khoảng 3 năm chưa vệ sinh.',
    requirements: [
      'Có dụng cụ vệ sinh và bơm gas',
      'Cam kết bảo hành 1 tháng',
    ],
    applicantCount: 6,
  },
  {
    id: 'j-006',
    title: 'Gia sư tiếng Anh giao tiếp cho trẻ 10 tuổi — Online',
    category: 'Gia sư',
    categoryId: 'tutor',
    budget: 300000,
    budgetUnit: 'VND',
    location: 'Online',
    district: 'Zoom/Meet',
    postedAt: '6 giờ trước',
    deadline: '25/05/2026',
    postedBy: {
      name: 'Anh Khoa',
      avatar: 'https://i.pravatar.cc/150?img=51',
      rating: 4.9,
      verified: true,
    },
    description:
      'Con trai 10 tuổi, lớp 5, đang học chương trình Cambridge. Cần gia sư người Việt nói chuẩn tiếng Anh để luyện giao tiếp 2 buổi/tuần, mỗi buổi 1h. Bài tập theo giáo trình của cô ở trường.',
    requirements: [
      'IELTS 7.0+ hoặc native speaker',
      'Có kinh nghiệm dạy trẻ em',
      'Vui vẻ, kiên nhẫn',
    ],
    applicantCount: 17,
  },
];

export const FEATURED_WORKERS: Worker[] = [
  {
    id: 'w-001',
    name: 'Nguyễn Văn Tài',
    avatar: 'https://i.pravatar.cc/150?img=11',
    title: 'Thợ điện · 8 năm kinh nghiệm',
    rating: 4.9,
    reviewCount: 127,
    completedJobs: 156,
    hourlyRate: 180000,
    location: 'TP. HCM',
    skills: ['Điện dân dụng', 'Điện công nghiệp', 'Lắp đặt CCTV', 'Mạng LAN'],
    verified: true,
    online: true,
    bio: 'Thợ điện chuyên nghiệp với 8 năm kinh nghiệm. Chuyên kéo dây điện toàn bộ cho nhà mới xây, sửa chữa điện hư hỏng, lắp đặt hệ thống an ninh. Cam kết bảo hành 12 tháng cho mọi công trình.',
    yearsExperience: 8,
  },
  {
    id: 'w-002',
    name: 'Phạm Thị Hằng',
    avatar: 'https://i.pravatar.cc/150?img=45',
    title: 'Designer · UI/UX & Branding',
    rating: 5.0,
    reviewCount: 89,
    completedJobs: 102,
    hourlyRate: 350000,
    location: 'Hà Nội',
    skills: ['UI/UX', 'Logo design', 'Brand identity', 'Figma', 'Adobe Suite'],
    verified: true,
    online: true,
    bio: 'Designer với portfolio 100+ dự án thương hiệu. Tốt nghiệp ĐH Mỹ thuật Công nghiệp Hà Nội. Style: tối giản, có chiều sâu văn hóa. Đã làm cho các brand: Cộng Cà Phê, Phin Deli, Highlands.',
    yearsExperience: 6,
  },
  {
    id: 'w-003',
    name: 'Trần Quốc Anh',
    avatar: 'https://i.pravatar.cc/150?img=14',
    title: 'Tài xế hạng C · 12 năm',
    rating: 4.8,
    reviewCount: 234,
    completedJobs: 312,
    hourlyRate: 120000,
    location: 'TP. HCM',
    skills: ['Xe tải 1.5T', 'Xe tải 3.5T', 'Vận chuyển nội thành', 'Bốc xếp'],
    verified: true,
    online: false,
    bio: 'Tài xế xe tải 12 năm kinh nghiệm, từng giao hàng cho Tiki, Shopee Express. Có xe tải riêng 1.5T và 3.5T. Sẵn sàng nhận hàng gấp trong 1 giờ.',
    yearsExperience: 12,
  },
  {
    id: 'w-004',
    name: 'Lê Thị Mai',
    avatar: 'https://i.pravatar.cc/150?img=49',
    title: 'Gia sư tiếng Anh · IELTS 8.0',
    rating: 4.95,
    reviewCount: 56,
    completedJobs: 78,
    hourlyRate: 250000,
    location: 'Hà Nội · Online',
    skills: ['IELTS', 'TOEIC', 'Tiếng Anh giao tiếp', 'Tiếng Anh trẻ em'],
    verified: true,
    online: true,
    bio: 'Cô giáo Mai, IELTS 8.0, 5 năm dạy IELTS và tiếng Anh trẻ em. Học viên đã đạt 7.0+ trong 6 tháng. Phương pháp: giao tiếp tự nhiên, không học vẹt.',
    yearsExperience: 5,
  },
  {
    id: 'w-005',
    name: 'Đỗ Văn Hùng',
    avatar: 'https://i.pravatar.cc/150?img=58',
    title: 'Thợ máy lạnh · Daikin, LG, Panasonic',
    rating: 4.7,
    reviewCount: 184,
    completedJobs: 221,
    hourlyRate: 200000,
    location: 'TP. HCM',
    skills: ['Máy lạnh', 'Máy giặt', 'Tủ lạnh', 'Bơm gas R32/R410'],
    verified: true,
    online: true,
    bio: 'Chuyên sửa máy lạnh các hãng. Vệ sinh, bơm gas, thay lốc, sửa board. Có đầy đủ dụng cụ chuyên nghiệp. Phục vụ tận nhà trong 2 giờ.',
    yearsExperience: 9,
  },
];

export const formatVND = (amount: number): string => {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)} triệu`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}k`;
  }
  return amount.toLocaleString('vi-VN');
};

export const getJobById = (id: string): Job | undefined =>
  FEATURED_JOBS.find(j => j.id === id);

export const getWorkerById = (id: string): Worker | undefined =>
  FEATURED_WORKERS.find(w => w.id === id);
