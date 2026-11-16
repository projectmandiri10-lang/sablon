import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  AlertCircle,
  AtSign,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cloud,
  Code,
  Cpu,
  Crown,
  CreditCard,
  Cookie,
  Database,
  Download,
  Eye,
  FileDown,
  FileText,
  Github,
  Globe,
  Gavel,
  Heart,
  HelpCircle,
  Image as ImageIcon,
  Instagram,
  Layers,
  Lightbulb,
  Loader2,
  Lock,
  Mail,
  MapPinned,
  Menu,
  MessageSquareQuote,
  PenTool,
  PhoneCall,
  Quote,
  RefreshCw,
  Rocket,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Twitter,
  Youtube,
  UploadCloud,
  User,
  UserCheck,
  Users,
  Scale,
  Wand2,
  X,
  Zap
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import BrandMark from './BrandMark.jsx';
import { absoluteUrl, submitContactMessage } from '../lib/api.js';
import { IMAGE_RETOUCH_PRICE_IDR, READY_PROCESS_PRICE_IDR, formatRupiah } from '../lib/pricing.js';

const SUPPORT_PHONE = '085156861485';
const SUPPORT_WHATSAPP = SUPPORT_PHONE;
const SUPPORT_EMAIL_LABEL = 'Belum tersedia saat ini';

const heroStats = [
  { icon: Star, value: '500+', label: 'Logo Diproses', accent: 'text-chart-3' },
  { icon: Sparkles, value: '98%', label: 'Kepuasan', accent: 'text-primary' },
  { icon: Zap, value: '2', label: 'Mode Output', accent: 'text-chart-2' }
];

const howItWorks = [
  {
    number: '01',
    icon: UploadCloud,
    title: 'Upload Gambar',
    description: 'Upload foto logo kaos yang ingin di-redesign. Mendukung format PNG, JPG, WEBP.',
    detail: 'Drag and drop atau pilih file'
  },
  {
    number: '02',
    icon: Wand2,
    title: 'Pilih Mode',
    description: `AI Redesign Premium (${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)}) atau Pecah Warna & Buat Pola Cutting Sticker (${formatRupiah(READY_PROCESS_PRICE_IDR)}).`,
    detail: 'Pilih output: Sablon atau Sticker'
  },
  {
    number: '03',
    icon: Download,
    title: 'Download Hasil',
    description: 'Dapatkan logo bersih siap sablon atau sticker dalam hitungan detik.',
    detail: 'High quality, siap cetak'
  }
];

const pricingCards = [
  {
    title: 'AI Redesign',
    price: IMAGE_RETOUCH_PRICE_IDR,
    description: 'Untuk gambar yang belum rapih, perlu analisis AI dan redesign ulang. Harga sudah termasuk pecah warna sablon.',
    icon: Sparkles,
    popular: true,
    features: ['AI Image-to-Image', 'Termasuk pecah warna sablon', 'Sablon + Sticker mode', 'High Quality Output', 'Hasil dalam 1-3 menit']
  },
  {
    title: 'Pecah Warna & Buat Pola Cutting Sticker',
    price: READY_PROCESS_PRICE_IDR,
    description: 'Untuk gambar yang sudah bersih dan siap dipisah warna film sablon serta dibuat pola contour cutting sticker tanpa proses AI.',
    icon: Zap,
    popular: false,
    features: ['Pecah warna film sablon', 'Pola contour cutting sticker', 'Output SVG & PDF siap cetak', 'Proses cepat (30-60 detik)', 'Hemat budget (Rp2.000/gambar)']
  }
];

const creditPackages = [
  {
    name: 'Paket Basic',
    balanceIdr: 10000,
    price: 10000,
    callout: 'Cukup untuk 2 AI Redesign promo yang sudah termasuk pecah warna atau 5 job Pecah Warna & Pola Cutting Sticker.',
    aiRedesign: 2,
    readyToTrace: 5
  },
  {
    name: 'Paket Standard',
    balanceIdr: 20000,
    price: 20000,
    callout: 'Cocok untuk 4 AI Redesign promo termasuk pecah warna atau 10 job vector ringan.',
    aiRedesign: 4,
    readyToTrace: 10
  },
  {
    name: 'Paket Premium',
    balanceIdr: 50000,
    price: 50000,
    highlight: true,
    callout: 'Paling pas untuk kebutuhan produksi berulang.',
    aiRedesign: 10,
    readyToTrace: 25
  }
];

const testimonials = [
  {
    name: 'Budi Santoso',
    role: 'Pemilik Konveksi',
    initials: 'BS',
    quote: `Hasil redesign logonya sangat bersih dan siap sablon. Dulu saya harus bayar desainer lumayan mahal, sekarang cukup ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)} per gambar.`,
    rating: 5
  },
  {
    name: 'Siti Rahayu',
    role: 'Seller Kaos Online',
    initials: 'SR',
    quote:
      'Mode Pecah Warna & Buat Pola Cutting Sticker sangat cocok untuk desain bersih yang tinggal dipisah warna dan dibuat pola contour sticker. Prosesnya cepat dan hasilnya memuaskan.',
    rating: 5
  },
  {
    name: 'Ahmad Fauzi',
    role: 'Desainer Freelance',
    initials: 'AF',
    quote:
      'Sebagai desainer, saya skeptis awalnya. Tapi hasil AI Redesign-nya benar-benar impresif dan menghemat banyak waktu.',
    rating: 5
  }
];

const faqItems = [
  {
    question: 'Apa itu EasyRedesign Pro?',
    answer:
      'EasyRedesign Pro adalah platform berbasis AI yang membantu Anda mengubah foto logo kaos menjadi desain bersih dan profesional yang siap untuk disablon atau dijadikan sticker.'
  },
  {
    question: 'Berapa harga per gambar?',
    answer:
      `Kami menawarkan dua mode harga: AI Redesign Premium seharga ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)} per gambar dan harga ini sudah termasuk pecah warna sablon. Mode Pecah Warna & Buat Pola Cutting Sticker seharga ${formatRupiah(READY_PROCESS_PRICE_IDR)} per gambar. Anda dapat membeli saldo melalui top up QRIS otomatis.`
  },
  {
    question: 'Apa perbedaan AI Redesign dan Pecah Warna & Buat Pola Cutting Sticker?',
    answer:
      'AI Redesign Premium menggunakan image-to-image untuk menggambar ulang desain sulit atau foto kaos buram. Mode Pecah Warna & Buat Pola Cutting Sticker memproses gambar yang sudah bersih tanpa AI untuk separasi warna sablon dan pola cutting sticker.'
  },
  {
    question: 'Format output apa saja?',
    answer:
      'Kami menyediakan dua mode output: Sablon untuk cetak sablon kaos dan Sticker untuk cetak sticker dengan detail tinggi.'
  },
  {
    question: 'Bagaimana cara membeli credit?',
    answer:
      'Anda dapat membeli credit secara instan melalui top up QRIS otomatis di menu Billing. Scan QRIS sesuai nominal unik dan saldo akan masuk otomatis ke akun Anda.'
  },
  {
    question: 'Berapa lama proses gambar?',
    answer:
      'Mode Pecah Warna & Buat Pola Cutting Sticker biasanya selesai dalam 30-60 detik. Mode AI Redesign membutuhkan waktu sekitar 1-3 menit.'
  },
  {
    question: 'Apakah gambar saya aman?',
    answer:
      'Keamanan data Anda adalah prioritas kami. Semua gambar diproses secara aman dan tidak akan dibagikan ke pihak ketiga.'
  }
];

const trustBadges = [
  { icon: ShieldCheck, text: 'Tanpa Kartu Kredit', subtext: 'Top up via QRIS otomatis' },
  { icon: Sparkles, text: 'AI Redraw Promo Rp5.000', subtext: 'Sudah termasuk pecah warna' },
  { icon: Clock, text: 'Daftar 30 Detik', subtext: 'Proses instan' },
  { icon: Zap, text: 'Hasil Instan', subtext: 'Siap dalam hitungan detik' }
];

const socialLinks = [
  { label: 'Twitter', icon: Twitter, href: '#' },
  { label: 'Instagram', icon: Instagram, href: '#' },
  { label: 'YouTube', icon: Youtube, href: '#' },
  { label: 'GitHub', icon: Github, href: '#' }
];

const privacySections = [
  {
    icon: Eye,
    title: '1. Pendahuluan',
    content: [
      'Kebijakan Privasi ini menjelaskan bagaimana kami mengumpulkan, menggunakan, menyimpan, membagikan, dan melindungi informasi pribadi Anda saat Anda menggunakan platform kami.',
      'Dengan mengakses, membuat akun, mengunggah gambar, membeli credit, atau menggunakan layanan kami, Anda menyetujui praktik yang dijelaskan dalam Kebijakan Privasi ini.'
    ]
  },
  {
    icon: Database,
    title: '2. Informasi yang Kami Kumpulkan',
    subsections: [
      {
        subtitle: 'Informasi yang Anda Berikan',
        items: [
          'Nama lengkap, nama pengguna, dan alamat email',
          'Informasi akun, invoice, order ID, nominal top up, dan status pembayaran',
          'Gambar, file desain, dan instruksi yang Anda upload untuk diproses',
          'Bukti pembayaran, pesan dukungan, dan komunikasi Anda'
        ]
      },
      {
        subtitle: 'Informasi yang Dikumpulkan Otomatis',
        items: [
          'Alamat IP, jenis browser, sistem operasi, dan perangkat yang digunakan',
          'Halaman yang Anda kunjungi, waktu akses, log keamanan, dan aktivitas akun',
          'Data cookie dan teknologi serupa',
          'Data transaksi dari kanal pembayaran QRIS otomatis yang aktif'
        ]
      }
    ]
  },
  {
    icon: Globe,
    title: '3. Bagaimana Kami Menggunakan Informasi Anda',
    list: [
      'Menyediakan, mengoperasikan, dan memelihara layanan kami',
      'Memproses gambar dan menghasilkan desain ulang',
      'Mengelola akun pengguna dan verifikasi',
      'Memproses top up credit, pembayaran, rekonsiliasi, refund, chargeback, dan dispute transaksi',
      'Menanggapi pertanyaan dan permintaan Anda',
      'Mencegah penipuan, penyalahgunaan, transaksi tidak sah, dan pelanggaran keamanan',
      'Memenuhi kewajiban hukum, audit, perpajakan, pembukuan, dan permintaan regulator yang sah'
    ]
  },
  {
    icon: ShieldCheck,
    title: '4. Pembagian Informasi',
    list: [
      'Penyedia layanan pihak ketiga yang membantu operasional platform, termasuk hosting, storage, email, analitik, dukungan pelanggan, dan pemrosesan gambar',
      'Penyedia layanan pembayaran QRIS, bank, atau e-wallet sejauh diperlukan untuk memproses pembayaran, rekonsiliasi, dan pencegahan fraud',
      'Pihak berwenang, regulator, pengadilan, atau instansi pemerintah bila diwajibkan oleh hukum atau proses hukum yang sah',
      'Perlindungan hak, properti, keamanan platform, pengguna, atau publik',
      'Transaksi bisnis seperti akuisisi atau penggabungan'
    ]
  },
  {
    icon: Lock,
    title: '5. Keamanan Data',
    content: [
      'Kami menerapkan langkah-langkah keamanan teknis dan organisasi yang wajar untuk melindungi informasi pribadi Anda.',
      'Data pembayaran sensitif seperti nomor kartu penuh, CVV, PIN, atau kredensial pembayaran diproses oleh payment gateway atau kanal pembayaran yang berwenang; kami tidak menyimpan data tersebut di server aplikasi.',
      'Gambar yang diupload akan diproses untuk menghasilkan output desain dan dapat disimpan sementara atau di galeri akun sesuai kebutuhan layanan, dukungan, audit, atau penghapusan yang Anda minta.'
    ]
  },
  {
    icon: UserCheck,
    title: '6. Hak Anda',
    list: [
      'Hak akses atas informasi pribadi Anda',
      'Hak koreksi atas informasi yang tidak akurat',
      'Hak penghapusan dalam batas kewajiban hukum, pembukuan, audit, keamanan, dan penyelesaian sengketa transaksi',
      'Hak pembatasan pemrosesan data',
      'Hak portabilitas data',
      'Hak keberatan atas pemrosesan tertentu',
      'Hak menarik persetujuan dengan memahami bahwa beberapa layanan mungkin tidak dapat digunakan tanpa data yang diperlukan'
    ]
  },
  {
    icon: Cookie,
    title: '7. Cookie',
    list: [
      'Cookie esensial untuk autentikasi dan keamanan',
      'Cookie fungsional untuk mengingat preferensi',
      'Cookie analitik untuk memahami penggunaan',
      'Cookie pemasaran untuk relevansi iklan'
    ]
  },
  {
    icon: RefreshCw,
    title: '8. Perubahan Kebijakan',
    content: [
      'Kami dapat memperbarui Kebijakan Privasi ini sewaktu-waktu. Perubahan akan berlaku efektif segera setelah dipublikasikan.',
      'Jika perubahan bersifat material, kami dapat memberi pemberitahuan melalui halaman aplikasi, email, atau kanal komunikasi lain yang tersedia.'
    ]
  },
  {
    icon: Mail,
    title: '9. Kontak Kami',
    list: [`Telepon: ${SUPPORT_PHONE}`, `WhatsApp: ${SUPPORT_WHATSAPP}`, `Email: ${SUPPORT_EMAIL_LABEL}`],
    afterList: ['Kebijakan Privasi ini terakhir diperbarui pada 10 Juni 2026.']
  }
];

const termsSections = [
  {
    icon: BookOpen,
    title: '1. Ketentuan Umum',
    content: [
      'Syarat dan Ketentuan ini mengatur hubungan antara Anda dan kami dalam penggunaan layanan platform EasyRedesign Pro.',
      'Dengan mendaftar, mengunggah gambar, membeli credit, melakukan pembayaran, atau menggunakan layanan kami, Anda dianggap telah membaca, memahami, dan menyetujui seluruh ketentuan ini sebagai persetujuan elektronik yang sah.'
    ]
  },
  {
    icon: Layers,
    title: '2. Definisi',
    list: [
      'Platform: situs web dan layanan EasyRedesign Pro',
      'Pengguna: individu yang mendaftar dan menggunakan layanan',
      'Layanan: seluruh fitur AI Redesign serta Pecah Warna & Buat Pola Cutting Sticker',
      'Credit: unit pembayaran untuk mengakses layanan',
      'Gambar: file yang diunggah untuk diproses',
      'Kanal pembayaran: sistem pembayaran QRIS otomatis yang kami aktifkan untuk memproses transaksi top up credit'
    ]
  },
  {
    icon: Server,
    title: '3. Layanan',
    list: [
      `AI Redesign Premium: ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)} per gambar`,
      'Harga AI Redesign sudah termasuk pecah warna sablon',
      `Pecah Warna & Buat Pola Cutting Sticker: ${formatRupiah(READY_PROCESS_PRICE_IDR)} per gambar`,
      'Download film separasi sablon tidak dikenakan biaya tambahan per warna',
      'Output sablon dan sticker',
      'Penyimpanan hasil pada galeri pribadi pengguna'
    ],
    afterList: ['Waktu pemrosesan bervariasi, Pecah Warna & Buat Pola Cutting Sticker sekitar 30-60 detik dan AI Redesign sekitar 1-3 menit.']
  },
  {
    icon: Scale,
    title: '4. Hak dan Kewajiban Pengguna',
    subsections: [
      {
        subtitle: 'Hak Pengguna',
        items: ['Menggunakan layanan sesuai ketentuan', 'Mengunduh hasil pemrosesan', 'Meminta penghapusan data pribadi']
      },
      {
        subtitle: 'Kewajiban Pengguna',
        items: [
          'Memberikan informasi yang akurat',
          'Menjaga kerahasiaan akun dan password',
          'Tidak menggunakan layanan untuk tujuan ilegal',
          'Tidak mengunggah konten yang melanggar hak pihak lain',
          'Memastikan Anda memiliki hak atau izin yang diperlukan atas logo, gambar, merek, atau materi yang diproses',
          'Tidak melakukan transaksi palsu, chargeback tidak sah, penyalahgunaan promo, atau percobaan fraud'
        ]
      }
    ]
  },
  {
    icon: CreditCard,
    title: '5. Sistem Credit dan Pembayaran',
    list: [
      'Credit dapat dibeli melalui kanal pembayaran resmi yang tersedia, yaitu top up QRIS otomatis di halaman Billing',
      'Pembayaran QRIS dapat diproses melalui bank, e-wallet, atau jaringan QRIS yang mendukung',
      'Dengan membayar melalui kanal pihak ketiga, pengguna juga tunduk pada syarat, kebijakan privasi, keamanan, biaya kanal, batas waktu pembayaran, dan status transaksi dari kanal tersebut',
      'Credit yang sudah dipakai untuk memproses gambar tidak dapat dikembalikan kecuali terjadi kegagalan sistem, transaksi ganda, layanan tidak tersedia, atau kondisi lain yang kami setujui setelah verifikasi',
      'Refund, pembatalan, chargeback, dan dispute mengikuti status pembayaran, bukti transaksi, dan ketentuan kanal pembayaran yang digunakan; pada payment gateway, proses refund umumnya hanya dapat dilakukan setelah transaksi berhasil atau settlement',
      'Credit tidak dapat ditransfer ke akun lain',
      'Credit memiliki masa berlaku 12 bulan'
    ]
  },
  {
    icon: Lightbulb,
    title: '6. Hak Kekayaan Intelektual',
    list: [
      'Hasil pemrosesan gambar menggunakan layanan kami menjadi milik pengguna',
      'Pengguna bertanggung jawab memastikan gambar tidak melanggar hak pihak lain',
      'Teknologi AI dan algoritma tetap menjadi hak kekayaan intelektual kami'
    ]
  },
  {
    icon: AlertCircle,
    title: '7. Batasan Tanggung Jawab',
    list: [
      'Kerugian akibat penggunaan atau ketidakmampuan menggunakan layanan',
      'Kualitas hasil yang tidak sesuai ekspektasi',
      'Kehilangan data akibat kegagalan teknis atau force majeure',
      'Keterlambatan, penolakan, biaya kanal, atau gangguan jaringan pada bank, e-wallet, atau jaringan QRIS yang digunakan pengguna',
      'Kerugian akibat pengguna mengunggah materi tanpa hak, izin, atau lisensi yang diperlukan'
    ]
  },
  {
    icon: Ban,
    title: '8. Penghentian Layanan',
    list: [
      'Melanggar syarat dan ketentuan',
      'Terlibat dalam aktivitas penipuan atau ilegal',
      'Menyalahgunakan platform',
      'Akun tidak aktif dalam jangka waktu panjang'
    ]
  },
  {
    icon: RefreshCw,
    title: '9. Perubahan Ketentuan',
    content: [
      'Kami dapat mengubah Syarat dan Ketentuan ini sewaktu-waktu. Perubahan berlaku efektif setelah dipublikasikan.',
      'Penggunaan layanan secara berkelanjutan setelah perubahan berarti Anda menyetujui ketentuan yang diperbarui.'
    ]
  },
  {
    icon: Gavel,
    title: '10. Hukum yang Berlaku',
    content: [
      'Syarat dan Ketentuan ini diatur dan ditafsirkan sesuai dengan hukum Republik Indonesia.',
      'Setiap sengketa akan diselesaikan melalui musyawarah mufakat terlebih dahulu.'
    ]
  },
  {
    icon: Mail,
    title: '11. Kontak',
    list: [`Telepon: ${SUPPORT_PHONE}`, `WhatsApp: ${SUPPORT_WHATSAPP}`, `Email: ${SUPPORT_EMAIL_LABEL}`],
    afterList: ['Syarat dan Ketentuan ini terakhir diperbarui pada 10 Juni 2026.']
  }
];

const contactFaq = [
  { question: 'Berapa lama proses AI Redesign?', answer: 'Biasanya 30 detik hingga 2 menit tergantung kompleksitas gambar.' },
  { question: 'Format gambar apa yang didukung?', answer: 'Kami mendukung JPG, PNG, dan WebP dengan ukuran maksimal 10MB.' },
  { question: 'Apakah credit bisa dikembalikan?', answer: 'Credit yang sudah digunakan tidak dapat dikembalikan kecuali jika proses gagal karena kesalahan sistem.' },
  { question: 'Bagaimana cara menghubungi support?', answer: `Anda bisa mengisi formulir di bawah atau menghubungi WhatsApp/telepon ${SUPPORT_PHONE}. Email support belum tersedia saat ini.` }
];

const contactSubjects = [
  { value: 'umum', label: 'Umum' },
  { value: 'teknis', label: 'Teknis' },
  { value: 'billing', label: 'Billing' },
  { value: 'lainnya', label: 'Lainnya' }
];

const aboutMissionVision = [
  {
    icon: Target,
    title: 'Misi Kami',
    description:
      'Menyediakan layanan redesain logo yang cepat, akurat, dan terjangkau untuk seluruh pelaku industri kaos di Indonesia melalui teknologi AI terdepan.'
  },
  {
    icon: Heart,
    title: 'Visi Kami',
    description:
      'Menjadi platform terdepan dalam transformasi digital industri sablon dan sticker di Indonesia, memberdayakan desainer dan pengusaha kecil.'
  }
];

const aboutStats = [
  { label: 'Pengguna Aktif', value: 2500, suffix: '+', icon: Users },
  { label: 'Gambar Diproses', value: 10000, suffix: '+', icon: ImageIcon },
  { label: 'Uptime', value: 99.9, suffix: '%', icon: ShieldCheck }
];

const aboutTimeline = [
  { date: 'Jan 2024', title: 'Konsep dan Riset', description: 'Memulai riset kebutuhan pasar dan mengembangkan konsep platform.', icon: Lightbulb },
  { date: 'Mar 2024', title: 'Pengembangan MVP', description: 'Membangun versi awal platform dengan fitur AI Redesign dasar.', icon: Rocket },
  { date: 'Jun 2024', title: 'Beta Testing', description: 'Meluncurkan versi beta ke pengguna awal dan mengumpulkan feedback.', icon: Users },
  { date: 'Sep 2024', title: 'Peluncuran Publik', description: 'Resmi meluncurkan platform dengan fitur AI Redesign serta Pecah Warna & Buat Pola Cutting Sticker.', icon: Star },
  { date: 'Des 2024', title: '10.000 Gambar Diproses', description: 'Lebih dari 10.000 gambar berhasil diproses di platform.', icon: Trophy }
];

const aboutTechStack = [
  { icon: BrainCircuit, name: 'VLM', description: 'Menganalisis dan memahami gambar logo secara mendalam dengan AI' },
  { icon: Wand2, name: 'AI Image Generation', description: 'Menghasilkan desain ulang berkualitas tinggi dari gambar yang dianalisis' },
  { icon: ImageIcon, name: 'Image Processing Pipeline', description: 'Mengoptimalkan gambar untuk output siap sablon dan sticker' },
  { icon: Eye, name: 'Computer Vision', description: 'Mendeteksi elemen-elemen desain dalam gambar' },
  { icon: Cloud, name: 'Cloud Infrastructure', description: 'Infrastruktur cloud yang handal untuk pemrosesan cepat dan aman' },
  { icon: Code, name: 'Modern Web Stack', description: 'Platform modern yang cepat, aman, dan mudah digunakan' }
];

const aboutTeam = [
  { name: 'Ahmad Rizki', role: 'Founder & CEO', initials: 'AR' },
  { name: 'Sari Dewi', role: 'Head of AI Research', initials: 'SD' },
  { name: 'Budi Prasetyo', role: 'Lead Developer', initials: 'BP' },
  { name: 'Maya Putri', role: 'UI/UX Designer', initials: 'MP' }
];

const heroStatsEn = [
  { icon: Star, value: '500+', label: 'Logos Processed', accent: 'text-chart-3' },
  { icon: Sparkles, value: '98%', label: 'Satisfaction', accent: 'text-primary' },
  { icon: Zap, value: '2', label: 'Output Modes', accent: 'text-chart-2' }
];

const howItWorksEn = [
  {
    number: '01',
    icon: UploadCloud,
    title: 'Upload Image',
    description: 'Upload your shirt logo photo. Supports PNG, JPG, and WEBP files.',
    detail: 'Drag and drop or choose a file'
  },
  {
    number: '02',
    icon: Wand2,
    title: 'Choose a Mode',
    description: `AI Redesign Premium (${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)}) or Color Separation & Sticker Cutline (${formatRupiah(READY_PROCESS_PRICE_IDR)}).`,
    detail: 'Choose the output: screen print or sticker'
  },
  {
    number: '03',
    icon: Download,
    title: 'Download Result',
    description: 'Get a cleaner logo ready for screen printing or sticker production in seconds.',
    detail: 'High quality, print-ready'
  }
];

const pricingCardsEn = [
  {
    title: 'AI Redesign',
    price: IMAGE_RETOUCH_PRICE_IDR,
    description: 'For blurry photos, scans, or logos that need AI analysis and redraw. Color separation is included.',
    icon: Sparkles,
    popular: true,
    features: ['AI Image-to-Image', 'Color separation included', 'Screen Print + Sticker mode', 'High Quality Output', 'Results in 1-3 minutes']
  },
  {
    title: 'Color Separation & Sticker Cutline',
    price: READY_PROCESS_PRICE_IDR,
    description: 'For clean artwork processed without AI to separate screen-print colors and generate sticker cutline patterns.',
    icon: Zap,
    popular: false,
    features: ['Screen-print color separation', 'Sticker contour cutline pattern', 'Print-ready SVG & PDF', 'Fast Processing (30-60s)', 'Budget Friendly (Rp2,000/image)']
  }
];

const creditPackagesEn = [
  {
    name: 'Basic Package',
    balanceIdr: 10000,
    price: 10000,
    callout: 'Fits 1 AI Redesign with color separation included or 5 ready-vector jobs.',
    aiRedesign: 1,
    readyToTrace: 5
  },
  {
    name: 'Standard Package',
    balanceIdr: 20000,
    price: 20000,
    callout: 'Good for 2 AI Redesign jobs with color separation included or 10 ready-vector jobs.',
    aiRedesign: 2,
    readyToTrace: 10
  },
  {
    name: 'Premium Package',
    balanceIdr: 50000,
    price: 50000,
    highlight: true,
    callout: 'Best value for recurring production work.',
    aiRedesign: 5,
    readyToTrace: 25
  }
];

const testimonialsEn = [
  {
    name: 'Budi Santoso',
    role: 'Garment Shop Owner',
    initials: 'BS',
    quote: `The redesign result is clean and ready for screen print. I used to pay designers much more, and now it only costs ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)} per image.`,
    rating: 5
  },
  {
    name: 'Siti Rahayu',
    role: 'Online Shirt Seller',
    initials: 'SR',
    quote: 'The Color Separation & Sticker Cutline mode is perfect for clean artwork that only needs color separation and sticker contours. Fast and reliable.',
    rating: 5
  },
  {
    name: 'Ahmad Fauzi',
    role: 'Freelance Designer',
    initials: 'AF',
    quote: 'I was skeptical at first, but the AI Redesign results are genuinely impressive and save a lot of time.',
    rating: 5
  }
];

const faqItemsEn = [
  {
    question: 'What is EasyRedesign Pro?',
    answer: 'EasyRedesign Pro is an AI-based platform that helps turn shirt logo photos into cleaner, more professional artwork ready for screen printing or stickers.'
  },
  {
    question: 'How much does each image cost?',
    answer: `We currently offer two pricing modes: AI Redesign Premium at ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)} per image with screen-print color separation included, and Color Separation & Sticker Cutline at ${formatRupiah(READY_PROCESS_PRICE_IDR)} per image. You can top up your balance via automatic QRIS.`
  },
  {
    question: 'What is the difference between AI Redesign and Color Separation & Sticker Cutline?',
    answer: 'AI Redesign uses image-to-image AI to redraw difficult artwork. Color Separation & Sticker Cutline processes clean artwork without AI for screen-print color separation and sticker cutline patterns.'
  },
  {
    question: 'What output formats are available?',
    answer: 'We provide two output directions: screen print and sticker, each optimized for production.'
  },
  {
    question: 'How can I buy credits?',
    answer: 'You can top up credits instantly via automatic QRIS in the Billing menu.'
  },
  {
    question: 'How long does processing take?',
    answer: 'Color Separation & Sticker Cutline usually finishes in 30-60 seconds. AI Redesign usually takes around 1-3 minutes.'
  },
  {
    question: 'Are my images safe?',
    answer: 'Your data security is a priority. Images are processed securely and are not shared with third parties.'
  }
];

const trustBadgesEn = [
  { icon: ShieldCheck, text: 'No Credit Card', subtext: 'Instant QRIS top-up' },
  { icon: Sparkles, text: 'AI Redraw Promo Rp5,000', subtext: 'Color separation included' },
  { icon: Clock, text: '30s Signup', subtext: 'Quick access' },
  { icon: Zap, text: 'Fast Results', subtext: 'Ready in seconds' }
];

function navigatePath(path, onNavigate) {
  if (typeof onNavigate === 'function') {
    onNavigate(path);
    return;
  }
  window.location.assign(path);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function scrollToId(id) {
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function formatMiniRupiah(value) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(value || 0)}`;
}

function useCounter(target, enabled = true, duration = 1200) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        const startTime = performance.now();
        const animate = (now) => {
          const progress = Math.min((now - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setCount(Math.round(target * eased));
          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        };
        requestAnimationFrame(animate);
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [duration, enabled, target]);

  return { count, ref };
}

function SectionHeader({ eyebrow, title, subtitle, id }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-violet-300">
          <Sparkles className="h-3.5 w-3.5" />
          {eyebrow}
        </div>
      )}
      <h2 id={id} className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
        <span className="gradient-text">{title}</span>
      </h2>
      {subtitle && <p className="mt-3 text-base leading-relaxed text-slate-300 sm:text-lg">{subtitle}</p>}
    </div>
  );
}

function PublicNav({ locale = 'id', onLocaleChange, onStart }) {
  const isId = locale === 'id';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = [
    { label: isId ? 'Beranda' : 'Home', id: 'beranda' },
    { label: isId ? 'Cara Kerja' : 'How It Works', id: 'how-it-works' },
    { label: isId ? 'Harga' : 'Pricing', id: 'pricing' },
    { label: 'FAQ', id: 'faq' }
  ];

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 10);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function handleStart() {
    setMobileOpen(false);
    if (typeof onStart === 'function') {
      onStart();
      return;
    }
    scrollToId('auth');
  }

  function handleSectionClick(id) {
    setMobileOpen(false);
    scrollToId(id);
  }

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        scrolled ? 'glass-nav shadow-lg shadow-black/25' : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={() => scrollToId('beranda')} className="flex items-center gap-2 text-left transition-opacity hover:opacity-85">
          <BrandMark compact dark />
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => handleSectionClick(link.id)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </button>
          ))}
          <div className="ml-2 inline-flex items-center overflow-hidden rounded-lg border border-white/15 bg-white/5 p-0.5">
            {['id', 'en'].map((nextLocale) => (
              <button
                key={nextLocale}
                type="button"
                onClick={() => onLocaleChange?.(nextLocale)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase transition ${
                  locale === nextLocale ? 'bg-primary text-white shadow-sm' : 'text-slate-300 hover:text-white'
                }`}
              >
                {nextLocale}
              </button>
            ))}
          </div>
          <div className="ml-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleStart}
              className="rounded-xl border border-white/15 px-3.5 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              {isId ? 'Masuk' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={handleStart}
              className="gradient-bg rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:opacity-95"
            >
              {isId ? 'Mulai' : 'Start'}
            </button>
          </div>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-white/15 bg-white/5 p-0.5">
            {['id', 'en'].map((nextLocale) => (
              <button
                key={nextLocale}
                type="button"
                onClick={() => onLocaleChange?.(nextLocale)}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase ${
                  locale === nextLocale ? 'bg-primary text-white' : 'text-slate-300'
                }`}
              >
                {nextLocale}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? (isId ? 'Tutup menu navigasi' : 'Close navigation menu') : isId ? 'Buka menu navigasi' : 'Open navigation menu'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-[#080d1a]/95 px-4 py-4 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-2">
            {links.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => handleSectionClick(link.id)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-sm font-medium text-slate-100 transition hover:bg-white/10"
              >
                {link.label}
              </button>
            ))}
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleStart}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                {isId ? 'Masuk' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="gradient-bg rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-primary/20"
              >
                {isId ? 'Daftar' : 'Sign Up'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function PublicFooter({ locale = 'id', onNavigate }) {
  const isId = locale === 'id';
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const helpLinks = [
    { label: 'FAQ', icon: HelpCircle, action: () => scrollToId('faq') },
    { label: isId ? 'Kontak' : 'Contact', icon: Mail, action: () => navigatePath('/contact', onNavigate) },
    { label: isId ? 'Kebijakan Privasi' : 'Privacy Policy', icon: ShieldCheck, action: () => navigatePath('/privacy', onNavigate) },
    { label: isId ? 'Syarat & Ketentuan' : 'Terms & Conditions', icon: FileText, action: () => navigatePath('/terms', onNavigate) },
    { label: isId ? 'Tentang Kami' : 'About Us', icon: BookOpen, action: () => navigatePath('/about', onNavigate) }
  ];

  function handleSubscribe(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    setEmail('');
    window.setTimeout(() => setSubscribed(false), 3000);
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <footer className="mt-auto overflow-hidden">
      <div className="h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <div className="landing-footer-shell relative mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <BrandMark compact dark />
            <p className="text-sm leading-relaxed text-slate-400">
              {isId
                ? 'Platform redesign logo & vector otomatis untuk kebutuhan produksi sablon dan sticker dalam hitungan detik.'
                : 'An AI-powered logo redesign and vector platform built for screen printing and sticker production in seconds.'}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{isId ? 'Layanan' : 'Services'}</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><button type="button" onClick={() => scrollToId('pricing')} className="transition hover:text-white">AI Redesign</button></li>
              <li><button type="button" onClick={() => scrollToId('pricing')} className="transition hover:text-white">{isId ? 'Pecah Warna & Pola Cutting Sticker' : 'Color Separation & Sticker Cutline'}</button></li>
              <li><button type="button" onClick={() => scrollToId('pricing')} className="transition hover:text-white">{isId ? 'Harga' : 'Pricing'}</button></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{isId ? 'Bantuan' : 'Help'}</h3>
            <ul className="space-y-2">
              {helpLinks.map((link) => (
                <li key={link.label}>
                  <button
                    type="button"
                    onClick={link.action}
                    className="group flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
                  >
                    <link.icon className="h-4 w-4 text-slate-500 transition group-hover:text-violet-400" />
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{isId ? 'Ikuti Kami' : 'Follow Us'}</h3>
            <div className="flex items-center gap-2.5">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  onClick={(event) => event.preventDefault()}
                  aria-label={social.label}
                  title={isId ? 'Segera hadir' : 'Coming soon'}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:border-primary/40 hover:bg-primary/10 hover:text-white"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
            <div className="space-y-2 pt-1">
              <p className="text-xs text-slate-400">{isId ? 'Dapatkan tips desain & update terbaru' : 'Get design tips and product updates'}</p>
              {subscribed ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  {isId ? 'Berhasil berlangganan!' : 'Subscribed successfully!'}
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={isId ? 'Email Anda' : 'Your email'}
                      className="min-w-0 w-full rounded-xl border border-white/15 bg-white/5 py-2 pl-8 pr-3 text-xs text-white outline-none placeholder:text-slate-500 focus:border-primary"
                    />
                  </div>
                  <button type="submit" className="inline-flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary/90">
                    <Send className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{isId ? 'Kirim' : 'Send'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="my-8 h-px bg-white/10" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} EasyRedesign Pro. {isId ? 'Hak cipta dilindungi.' : 'All rights reserved.'}</p>
          <div className="flex items-center gap-4">
            <p className="flex items-center gap-1 text-xs text-slate-500">
              Made with <Heart className="inline h-3 w-3 fill-red-500 text-red-500" /> in Indonesia
            </p>
            <button
              type="button"
              onClick={scrollToTop}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-300 transition hover:bg-primary hover:text-white"
              aria-label={isId ? 'Kembali ke atas' : 'Back to top'}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

function HeroSection({ locale = 'id', onStart }) {
  const isId = locale === 'id';
  const stats = isId ? heroStats : heroStatsEn;

  return (
    <section id="beranda" className="relative overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(#8b5cf6 1px, transparent 1px), linear-gradient(90deg, #8b5cf6 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
        <div className="absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-violet-300 sm:text-sm">
            <Sparkles className="h-3.5 w-3.5" />
            {isId ? 'AI Redraw + Pecah Warna Sablon Otomatis' : 'AI Redraw + Automatic Color Separation'}
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            <span className="gradient-text">EasyRedesign Pro</span>
            <span className="mt-2 block text-slate-100">
              {isId ? 'Foto Logo Buram Jadi Vector Siap Cetak' : 'Turn Blurry Logo Photos Into Print-Ready Vectors'}
            </span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            {isId
              ? 'Upload foto logo kaos, rapikan dengan AI, lalu dapatkan file SVG, PDF, film pecah warna sablon, dan cutline sticker siap produksi dalam hitungan menit.'
              : 'Upload a shirt logo photo, clean it with AI, and get production-ready SVG, PDF, screen-print separation films, and sticker cutlines in minutes.'}
          </p>

          <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={onStart}
              className="gradient-bg inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-7 text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:opacity-95 sm:text-base"
            >
              {isId ? 'Mulai Sekarang' : 'Get Started'}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollToId('how-it-works')}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 text-sm font-semibold text-slate-100 transition hover:bg-white/10 sm:text-base"
            >
              {isId ? 'Lihat Cara Kerja' : 'See How It Works'}
            </button>
          </div>
        </div>

        <div className="landing-showcase mx-auto mt-12 max-w-4xl overflow-hidden rounded-3xl p-5 sm:p-7">
          <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
            <div className="landing-before flex flex-col items-center justify-center rounded-2xl p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 text-slate-400">
                <ImageIcon className="h-7 w-7" />
              </div>
              <p className="mt-3 text-base font-bold text-slate-100">{isId ? 'Sebelum' : 'Before'}</p>
              <p className="mt-1 text-xs text-slate-400">{isId ? 'Foto kaos miring, buram, atau berbayang' : 'Blurry, angled, or shadowed shirt photo'}</p>
            </div>

            <div className="flex flex-col items-center justify-center gap-2 py-1">
              <div className="gradient-bg flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg shadow-primary/30">
                <Wand2 className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
                {isId ? 'AI + Trace Otomatis' : 'AI + Auto Trace'}
              </span>
            </div>

            <div className="landing-after flex flex-col items-center justify-center rounded-2xl p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/40 bg-primary/15 text-violet-300">
                <Layers className="h-7 w-7" />
              </div>
              <p className="mt-3 text-base font-bold text-violet-300">{isId ? 'Sesudah' : 'After'}</p>
              <p className="mt-1 text-xs text-slate-300">{isId ? 'Vector SVG, PDF, Film Sablon & Cutline' : 'Vector SVG, PDF, Screen Film & Cutline'}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 font-semibold text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
              {isId ? `Promo Perkenalan ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)}/gambar` : `Intro Promo ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)}/image`}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-semibold text-violet-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isId ? 'Sudah termasuk pecah warna sablon' : 'Screen-print color separation included'}
            </span>
          </div>
        </div>

        <div className="mx-auto mt-6 grid max-w-4xl gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="landing-stat-card flex items-center gap-4 rounded-2xl px-5 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5">
                <stat.icon className={`h-5 w-5 ${stat.accent}`} />
              </div>
              <div>
                <div className={`text-2xl font-extrabold tracking-tight ${stat.accent}`}>{stat.value}</div>
                <div className="text-xs font-medium text-slate-400">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepCard({ step }) {
  return (
    <div className="glass-card relative flex flex-col rounded-2xl p-6 transition hover:-translate-y-0.5 hover:border-primary/40">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-violet-300">
          <step.icon className="h-5 w-5" />
        </div>
        <span className="font-mono text-xs font-bold text-slate-400">STEP {step.number}</span>
      </div>
      <h3 className="text-lg font-bold text-white">{step.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-300">{step.description}</p>
      <div className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
        <CheckCircle2 className="h-3.5 w-3.5 text-violet-400" />
        {step.detail}
      </div>
    </div>
  );
}

function HowItWorksSection({ locale = 'id' }) {
  const isId = locale === 'id';
  const steps = isId ? howItWorks : howItWorksEn;
  return (
    <section id="how-it-works" className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow={isId ? 'Mudah dan Cepat' : 'Fast and Simple'}
          title={isId ? 'Cara Kerja' : 'How It Works'}
          subtitle={isId ? 'Tiga langkah ringkas untuk hasil desain siap sablon & sticker' : 'Three simple steps for print-ready screen and sticker designs'}
        />
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {steps.map((step) => (
            <StepCard key={step.number} step={step} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection({ locale = 'id' }) {
  const isId = locale === 'id';
  const cards = isId ? pricingCards : pricingCardsEn;
  const packages = isId ? creditPackages : creditPackagesEn;
  return (
    <section id="pricing" className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow={isId ? 'Harga Transparan' : 'Transparent Pricing'}
          title={isId ? 'Pilih Mode Sesuai Kebutuhan' : 'Choose Your Processing Mode'}
          subtitle={isId ? 'Bayar per gambar sesuai kebutuhan, tanpa langganan bulanan.' : 'Pay per image as you go, with no monthly subscription.'}
        />

        <div className="mx-auto mt-10 grid max-w-4xl gap-5 lg:grid-cols-2">
          {cards.map((card) => (
            <div key={card.title} className="relative overflow-hidden rounded-3xl">
              {card.popular && (
                <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white shadow-md">
                  <Crown className="h-3.5 w-3.5" />
                  {isId ? 'Paling Populer' : 'Most Popular'}
                </div>
              )}
              <div className={`h-full rounded-3xl p-6 sm:p-7 ${card.popular ? 'landing-pricing-surface-primary' : 'landing-pricing-surface-secondary'}`}>
                <div className="flex items-start gap-3 pr-24">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.popular ? 'bg-primary/20 text-violet-300' : 'bg-blue-500/15 text-blue-300'}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{card.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{card.description}</p>
                  </div>
                </div>

                <div className="mt-6 flex items-baseline gap-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                  <span>{formatMiniRupiah(card.price)}</span>
                  <span className="text-sm font-medium text-slate-400">{isId ? '/gambar' : '/image'}</span>
                </div>

                <ul className="mt-5 space-y-2.5 border-t border-white/10 pt-5">
                  {card.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm text-slate-200">
                      <BadgeCheck className={`h-4 w-4 shrink-0 ${card.popular ? 'text-violet-400' : 'text-blue-400'}`} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <h3 className="text-xl font-bold text-white sm:text-2xl">{isId ? 'Paket Saldo Credit' : 'Credit Top-Up Packages'}</h3>
          <p className="mt-1 text-sm text-slate-400">{isId ? 'Isi saldo instan & fleksibel via QRIS otomatis' : 'Instant & flexible top-ups via automatic QRIS'}</p>
        </div>

        <div className="mx-auto mt-7 grid max-w-5xl gap-4 sm:grid-cols-3">
          {packages.map((pkg) => (
            <div key={pkg.name} className={`landing-credit-card flex flex-col rounded-2xl p-5 ${pkg.highlight ? 'landing-credit-card-highlight ring-1 ring-primary/40' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-base font-bold text-white">{pkg.name}</h4>
                {pkg.highlight && (
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    {isId ? 'Favorit' : 'Popular'}
                  </span>
                )}
              </div>
              <div className="mt-3 text-2xl font-extrabold text-white">{formatMiniRupiah(pkg.price)}</div>
              <p className="mt-1 text-xs text-slate-400">
                {isId ? `Saldo masuk ${formatMiniRupiah(pkg.balanceIdr)}` : `Balance added ${formatMiniRupiah(pkg.balanceIdr)}`}
              </p>
              <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-xs text-slate-300">
                <p>• {pkg.aiRedesign}× AI Redesign ({isId ? 'termasuk pecah warna' : 'color separation included'})</p>
                <p>• {pkg.readyToTrace}× {isId ? 'Pecah Warna & Pola Cutting Sticker' : 'Color Separation & Sticker Cutline'}</p>
              </div>
              {pkg.callout && <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-400">{pkg.callout}</p>}
              <button
                type="button"
                onClick={() => scrollToId('auth')}
                className={`mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
                  pkg.highlight ? 'gradient-bg text-white shadow-md shadow-primary/25' : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                {isId ? 'Pilih Paket' : 'Select Package'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StarRow({ rating }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} className={`h-3.5 w-3.5 ${index < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}`} />
      ))}
    </div>
  );
}

function TestimonialsSection({ locale = 'id' }) {
  const isId = locale === 'id';
  const items = isId ? testimonials : testimonialsEn;
  return (
    <section id="testimonials" className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow={isId ? 'Testimoni' : 'Testimonials'}
          title={isId ? 'Dipercaya Pelaku Sablon & Desainer' : 'Trusted by Print Shops & Designers'}
          subtitle={isId ? 'Pengalaman nyata mempercepat produksi sablon dan sticker' : 'Real feedback from screen-print and sticker production workflows'}
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((testimonial, index) => (
            <div key={testimonial.name} className={`flex flex-col rounded-2xl p-6 ${index === 1 ? 'landing-testimonial-featured' : 'glass-card'}`}>
              <div className="mb-3 flex items-center justify-between">
                <StarRow rating={testimonial.rating} />
                <Quote className="h-5 w-5 text-primary/40" />
              </div>
              <p className="flex-1 text-sm leading-relaxed text-slate-300">{testimonial.quote}</p>
              <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-600 text-xs font-bold text-white">
                  {testimonial.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{testimonial.name}</p>
                  <p className="text-xs text-slate-400">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection({ locale = 'id' }) {
  const isId = locale === 'id';
  const items = isId ? faqItems : faqItemsEn;
  return (
    <section id="faq" className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={isId ? 'Pertanyaan Umum' : 'Frequently Asked Questions'}
          subtitle={isId ? 'Jawaban singkat seputar cara kerja, harga, dan keamanan file' : 'Quick answers about workflow, pricing, and file security'}
        />
        <div className="glass-card mt-10 overflow-hidden rounded-2xl">
          {items.map((item, index) => (
            <details key={item.question} className="landing-faq-item group overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-left text-sm font-semibold text-white sm:text-base">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-violet-300">
                  {index + 1}
                </span>
                <span className="flex-1">{item.question}</span>
                <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-4 pl-14 text-sm leading-relaxed text-slate-300">{item.answer}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection({ locale = 'id', onStart }) {
  const isId = locale === 'id';
  const badges = isId ? trustBadges : trustBadgesEn;
  return (
    <section className="relative overflow-hidden py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="gradient-bg relative overflow-hidden rounded-3xl px-6 py-12 text-center shadow-2xl shadow-primary/20 sm:px-10 sm:py-16">
          <div className="relative mx-auto max-w-3xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {isId ? 'Siap Ubah Foto Logo Jadi Siap Produksi?' : 'Ready to Turn Logo Photos Into Print Files?'}
            </h2>
            <p className="mt-3 text-base text-white/90 sm:text-lg">
              {isId
                ? 'Masuk sekarang dan manfaatkan promo perkenalan AI Redraw hanya Rp5.000, sudah termasuk pecah warna, atau pilih mode Pecah Warna & Buat Pola Cutting Sticker (Rp2.000).'
                : 'Sign in now and use the introductory AI Redesign promo at only Rp5,000 including color separation, or choose Color Separation & Sticker Cutline (Rp2,000).'}
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onStart}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-7 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-slate-100 sm:text-base"
              >
                {isId ? 'Mulai Sekarang' : 'Start Now'}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollToId('how-it-works')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-7 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 sm:text-base"
              >
                <Eye className="h-4 w-4" />
                {isId ? 'Lihat Demo' : 'See Demo'}
              </button>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {badges.map((badge) => (
                <div key={badge.text} className="landing-cta-badge rounded-2xl px-3 py-3">
                  <badge.icon className="mx-auto h-4 w-4 text-white/90" />
                  <div className="mt-1.5 text-xs font-semibold text-white">{badge.text}</div>
                  <div className="mt-0.5 text-[11px] text-white/75">{badge.subtext}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuthSection({ locale = 'id', authPanel }) {
  if (!authPanel) return null;
  const isId = locale === 'id';
  return (
    <section id="auth" className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-violet-300">
              <Sparkles className="h-3.5 w-3.5" />
              {isId ? 'Akses Studio' : 'Studio Access'}
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              <span className="gradient-text">{isId ? 'Masuk untuk Mulai Memproses Logo' : 'Sign In to Start Processing'}</span>
            </h2>
            <p className="max-w-xl text-base leading-relaxed text-slate-300">
              {isId
                ? 'Kelola proses redesign AI, pecah warna sablon, cutline sticker, riwayat pekerjaan, dan top up saldo QRIS otomatis dalam satu dashboard.'
                : 'Manage AI redraws, screen-print color separations, sticker cutlines, job history, and automatic QRIS top-ups in one workspace.'}
            </p>
            <div className="grid gap-2.5 pt-2 text-sm text-slate-300 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-violet-400" />
                <span>{isId ? 'Riwayat tersimpan rapi di browser' : 'History saved cleanly in browser'}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-violet-400" />
                <span>{isId ? 'Top up QRIS otomatis instan' : 'Instant automatic QRIS top-up'}</span>
              </div>
            </div>
          </div>
          <div>{authPanel}</div>
        </div>
      </div>
    </section>
  );
}

function ExamplesShowcaseSection({ locale = 'id', exampleJobs = [], onStart }) {
  const isId = locale === 'id';
  const items = (Array.isArray(exampleJobs) ? exampleJobs : []).filter(
    (item) => item?.resultPreviewUrl || item?.files?.fullPng || item?.sourcePreviewUrl || item?.files?.sourcePreview
  );
  if (!items.length) return null;

  return (
    <section id="examples" className="relative py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow={isId ? 'Contoh Hasil Nyata' : 'Live Sample Results'}
          title={isId ? 'Galeri Hasil Produksi Terbaru' : 'Recent Production Examples'}
          subtitle={
            isId
              ? 'Hasil asli yang diproses dan dipublikasikan langsung oleh studio untuk referensi kualitas sablon & cutting sticker.'
              : 'Real studio outputs published directly for screen-print separation & sticker cutline quality reference.'
          }
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {items.slice(0, 4).map((item) => {
            const beforeSrc = absoluteUrl(item.sourcePreviewUrl || item.files?.sourcePreview || '');
            const afterSrc = absoluteUrl(item.resultPreviewUrl || item.files?.fullPng || item.files?.tracedPng || '');
            const isSablon = item.productionType === 'sablon';
            const sepCount = Array.isArray(item.separations) ? item.separations.length : 0;
            return (
              <article key={item.jobId} className="glass-card flex flex-col justify-between rounded-3xl p-5 sm:p-6">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-white">{item.projectName || (isSablon ? 'Contoh Sablon' : 'Contoh Sticker')}</h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-primary/35 bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-violet-200">
                        {isSablon ? 'Sablon' : 'Sticker'}
                      </span>
                      {sepCount > 0 && (
                        <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
                          {sepCount} {isId ? 'film warna' : 'color films'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 p-2.5">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {isId ? 'Sebelum' : 'Before'}
                      </p>
                      <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl bg-slate-950/70">
                        {beforeSrc ? (
                          <img src={beforeSrc} alt={`${item.projectName || 'Sample'} before`} className="max-h-full max-w-full object-contain" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-slate-600" />
                        )}
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-primary/30 bg-slate-900/80 p-2.5">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-300">
                        {isId ? 'Sesudah' : 'After'}
                      </p>
                      <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl bg-white/95">
                        {afterSrc ? (
                          <img src={afterSrc} alt={`${item.projectName || 'Sample'} after`} className="max-h-full max-w-full object-contain" />
                        ) : (
                          <Layers className="h-6 w-6 text-violet-400" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3.5 text-xs text-slate-300">
                  <span>
                    {isId ? 'Masuk untuk lihat & unduh file SVG, PDF & film warna lengkap' : 'Sign in to view & download full SVG, PDF & color film files'}
                  </span>
                  <button
                    type="button"
                    onClick={onStart}
                    className="shrink-0 rounded-xl border border-primary/40 bg-primary/15 px-3 py-1.5 font-semibold text-violet-200 transition hover:bg-primary/25"
                  >
                    {isId ? 'Lihat di Studio' : 'Open Studio'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PublicLanding({ locale = 'id', onLocaleChange, onStart, authPanel, onNavigate, exampleJobs = [] }) {
  return (
    <div className="landing-shell min-h-screen text-slate-100">
      <PublicNav locale={locale} onLocaleChange={onLocaleChange} onStart={onStart} onNavigate={onNavigate} />
      <HeroSection locale={locale} onStart={onStart} />
      <ExamplesShowcaseSection locale={locale} exampleJobs={exampleJobs} onStart={onStart} />
      <HowItWorksSection locale={locale} />
      <PricingSection locale={locale} />
      <TestimonialsSection locale={locale} />
      <FaqSection locale={locale} />
      <CtaSection locale={locale} onStart={onStart} />
      <AuthSection locale={locale} authPanel={authPanel} onStart={onStart} />
      <PublicFooter locale={locale} onNavigate={onNavigate} />
    </div>
  );
}

function LegalShell({ locale = 'id', title, subtitle, icon: Icon, onNavigate, children }) {
  const isId = locale === 'id';
  return (
    <article className="min-h-screen gradient-bg-subtle text-slate-900">
      <header className="glass-nav sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button type="button" onClick={() => navigatePath('/', onNavigate)} className="text-left transition hover:opacity-80">
            <BrandMark compact />
          </button>
          <button
            type="button"
            onClick={() => navigatePath('/', onNavigate)}
            className="studio-btn-secondary"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            {isId ? 'Kembali ke Beranda' : 'Back to Home'}
          </button>
        </div>
      </header>

      <div className="border-b border-slate-200/80 bg-white/70 py-10 sm:py-12">
        <div className="mx-auto flex max-w-6xl items-start gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">{children}</div>
    </article>
  );
}

function LegalSectionList({ sections }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
      <aside className="studio-card p-5 lg:sticky lg:top-24">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Daftar Isi</h2>
        <ol className="mt-3 space-y-1.5">
          {sections.map((section) => (
            <li key={section.title}>
              <a
                href={`#${slugify(section.title)}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-primary/5 hover:text-primary"
              >
                <section.icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{section.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </aside>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} id={slugify(section.title)} className="studio-card scroll-mt-24 p-6">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <section.icon className="h-4 w-4" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">{section.title}</h3>
            </div>

            {section.content?.map((paragraph) => (
              <p key={paragraph} className="mb-3 text-sm leading-relaxed text-slate-600">
                {paragraph}
              </p>
            ))}

            {section.subsections?.map((subsection) => (
              <div key={subsection.subtitle} className="mb-4 rounded-xl bg-slate-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-900">{subsection.subtitle}</h4>
                <ul className="space-y-1.5">
                  {subsection.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {section.list && (
              <ul className="space-y-2">
                {section.list.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                    {item}
                  </li>
                ))}
              </ul>
            )}

            {section.afterList?.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-xs leading-relaxed text-slate-500">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PrivacyPage({ locale = 'id', onNavigate }) {
  const isId = locale === 'id';
  return (
    <LegalShell
      locale={locale}
      title={isId ? 'Kebijakan Privasi' : 'Privacy Policy'}
      subtitle={isId ? 'Bagaimana kami mengumpulkan, menggunakan, dan melindungi informasi pribadi Anda' : 'How we collect, use, and protect your personal information'}
      icon={ShieldCheck}
      onNavigate={onNavigate}
    >
      <LegalSectionList sections={privacySections} />
      <div className="mt-10 text-center text-sm text-slate-500">
        {isId ? 'Pertanyaan tentang kebijakan privasi kami?' : 'Questions about our privacy policy?'}{' '}
        <button type="button" onClick={() => navigatePath('/contact', onNavigate)} className="font-semibold text-primary underline underline-offset-4">
          {isId ? 'Hubungi kami' : 'Contact us'}
        </button>
      </div>
    </LegalShell>
  );
}

function TermsPage({ locale = 'id', onNavigate }) {
  const isId = locale === 'id';
  return (
    <LegalShell
      locale={locale}
      title={isId ? 'Syarat dan Ketentuan' : 'Terms and Conditions'}
      subtitle={isId ? 'Aturan penggunaan layanan EasyRedesign Pro' : 'Rules for using EasyRedesign Pro'}
      icon={FileText}
      onNavigate={onNavigate}
    >
      <LegalSectionList sections={termsSections} />
      <div className="mt-10 text-center text-sm text-slate-500">
        {isId ? 'Pertanyaan tentang syarat dan ketentuan?' : 'Questions about our terms?'}{' '}
        <button type="button" onClick={() => navigatePath('/contact', onNavigate)} className="font-semibold text-primary underline underline-offset-4">
          {isId ? 'Hubungi kami' : 'Contact us'}
        </button>
      </div>
    </LegalShell>
  );
}

function ContactFaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      className="studio-card p-4 text-left transition hover:border-primary/40"
    >
      <div className="flex items-center gap-3">
        <HelpCircle className="h-5 w-5 shrink-0 text-primary" />
        <span className="flex-1 text-sm font-semibold text-slate-900">{question}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && <p className="mt-3 pl-8 text-sm leading-relaxed text-slate-600">{answer}</p>}
    </button>
  );
}

function ContactPage({ locale = 'id', onNavigate }) {
  const isId = locale === 'id';
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const maxMessageLength = 5000;

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    if (errors[name]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[name];
        return next;
      });
    }
  }

  function handleSubjectChange(value) {
    setFormData((current) => ({ ...current, subject: value }));
    if (errors.subject) {
      setErrors((current) => {
        const next = { ...current };
        delete next.subject;
        return next;
      });
    }
  }

  function validate() {
    const nextErrors = {};
    if (!formData.name.trim()) nextErrors.name = isId ? 'Nama wajib diisi' : 'Name is required';
    if (!formData.email.trim()) nextErrors.email = isId ? 'Email wajib diisi' : 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) nextErrors.email = isId ? 'Format email tidak valid' : 'Invalid email format';
    if (!formData.subject) nextErrors.subject = isId ? 'Subjek wajib dipilih' : 'Please choose a subject';
    if (!formData.message.trim()) nextErrors.message = isId ? 'Pesan wajib diisi' : 'Message is required';
    else if (formData.message.length < 10) nextErrors.message = isId ? 'Pesan minimal 10 karakter' : 'Message must be at least 10 characters';
    else if (formData.message.length > maxMessageLength) nextErrors.message = isId ? `Pesan maksimal ${maxMessageLength.toLocaleString()} karakter` : `Message must be at most ${maxMessageLength.toLocaleString()} characters`;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await submitContactMessage(formData);
      setSuccess(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
      window.setTimeout(() => setSuccess(false), 3500);
    } catch (error) {
      const message = error instanceof Error ? error.message : isId ? 'Gagal mengirim pesan. Silakan coba lagi nanti.' : 'Failed to send the message. Please try again later.';
      setErrors((current) => ({ ...current, submit: message }));
    } finally {
      setIsSubmitting(false);
    }
  }

  function goToLandingSection(id) {
    navigatePath('/', onNavigate);
    window.setTimeout(() => scrollToId(id), 50);
  }

  return (
    <LegalShell
      locale={locale}
      title={isId ? 'Hubungi Kami' : 'Contact Us'}
      subtitle={isId ? 'Punya pertanyaan atau butuh bantuan? Tim kami siap membantu Anda' : 'Have a question or need help? Our team is ready to assist you.'}
      icon={Mail}
      onNavigate={onNavigate}
    >
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {contactFaq.map((item) => (
          <ContactFaqItem key={item.question} {...item} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="studio-card p-6">
          <div className="mb-5 flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-slate-900">{isId ? 'Kirim Pesan' : 'Send a Message'}</h2>
          </div>

          {success ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">{isId ? 'Pesan Terkirim' : 'Message Sent'}</h3>
              <p className="mt-2 text-sm text-slate-600">{isId ? 'Terima kasih telah menghubungi kami. Kami akan merespons pesan Anda dalam 1x24 jam.' : 'Thanks for contacting us. We will respond within 24 hours.'}</p>
              <button type="button" onClick={() => setSuccess(false)} className="mt-5 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700">
                {isId ? 'Kirim Pesan Lain' : 'Send Another Message'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <User className="h-4 w-4 text-slate-400" />
                    {isId ? 'Nama Lengkap' : 'Full Name'}
                  </span>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder={isId ? 'Masukkan nama Anda' : 'Enter your name'}
                    className={`studio-input ${errors.name ? 'border-red-400' : ''}`}
                  />
                  {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                </label>

                <label className="block space-y-1.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <AtSign className="h-4 w-4 text-slate-400" />
                    Email
                  </span>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="nama@email.com"
                    className={`studio-input ${errors.email ? 'border-red-400' : ''}`}
                  />
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </label>
              </div>

              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <FileText className="h-4 w-4 text-slate-400" />
                  {isId ? 'Subjek' : 'Subject'}
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {contactSubjects.map((subject) => (
                    <button
                      key={subject.value}
                      type="button"
                      onClick={() => handleSubjectChange(subject.value)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                        formData.subject === subject.value
                          ? 'border-primary bg-primary text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-primary/40 hover:bg-primary/5'
                      }`}
                    >
                      {subject.label}
                    </button>
                  ))}
                </div>
                {errors.subject && <p className="text-xs text-red-500">{errors.subject}</p>}
              </div>

              <label className="block space-y-1.5">
                <span className="flex items-center justify-between text-sm font-medium text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-slate-400" />
                    {isId ? 'Pesan' : 'Message'}
                  </span>
                  <span className={`text-xs tabular-nums ${formData.message.length > maxMessageLength * 0.9 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {formData.message.length.toLocaleString()} / {maxMessageLength.toLocaleString()}
                  </span>
                </span>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={6}
                  placeholder={isId ? 'Tuliskan pertanyaan atau kebutuhan Anda di sini' : 'Write your question or request here'}
                  className={`studio-input ${errors.message ? 'border-red-400' : ''}`}
                />
                {errors.message && <p className="text-xs text-red-500">{errors.message}</p>}
              </label>

              {errors.submit && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errors.submit}</p>}

              <button type="submit" disabled={isSubmitting} className="studio-btn-primary px-6">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSubmitting ? (isId ? 'Mengirim...' : 'Sending...') : isId ? 'Kirim Pesan' : 'Send Message'}
              </button>
            </form>
          )}
        </div>

        <aside className="space-y-4">
          <div className="studio-card p-5">
            <h3 className="text-base font-bold text-slate-900">{isId ? 'Info Kontak' : 'Contact Info'}</h3>
            <div className="mt-3 space-y-2.5 text-sm text-slate-600">
              <p>Telepon: <strong className="text-slate-900">{SUPPORT_PHONE}</strong></p>
              <p>WhatsApp: <strong className="text-slate-900">{SUPPORT_WHATSAPP}</strong></p>
              <p>Email: {SUPPORT_EMAIL_LABEL}</p>
              <p className="text-xs text-slate-500">{isId ? 'Jam kerja: Senin - Jumat, 09.00 - 17.00 WIB' : 'Business hours: Monday - Friday, 09:00 - 17:00 WIB'}</p>
            </div>
          </div>

          <div className="studio-card p-5">
            <h3 className="text-base font-bold text-slate-900">{isId ? 'Arah Cepat' : 'Quick Links'}</h3>
            <div className="mt-3 space-y-2 text-sm">
              <button type="button" onClick={() => goToLandingSection('faq')} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-left font-medium text-slate-700 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                {isId ? 'Lihat FAQ' : 'See FAQ'}
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </button>
              <button type="button" onClick={() => goToLandingSection('pricing')} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-left font-medium text-slate-700 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                {isId ? 'Lihat Harga' : 'See Pricing'}
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </button>
              <button type="button" onClick={() => goToLandingSection('beranda')} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-left font-medium text-slate-700 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                {isId ? 'Kembali ke Landing' : 'Back to Landing'}
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </LegalShell>
  );
}

function AboutPage({ locale = 'id', onNavigate }) {
  const isId = locale === 'id';
  const stats = aboutStats.map((stat) => ({ ...stat }));

  return (
    <LegalShell
      locale={locale}
      title={isId ? 'Tentang Kami' : 'About Us'}
      subtitle={isId ? 'Mengenal lebih dekat EasyRedesign Pro, platform redesign logo berbasis AI' : 'Get to know EasyRedesign Pro, an AI-powered logo redesign platform'}
      icon={Sparkles}
      onNavigate={onNavigate}
    >
      <div className="space-y-6">
        <div className="studio-card p-6">
          <h2 className="text-lg font-bold text-slate-900">{isId ? 'Tentang Kami' : 'About Us'}</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            <p>
              EasyRedesign Pro adalah platform inovatif yang menggunakan kecerdasan buatan untuk mentransformasi logo kaos menjadi desain profesional yang siap untuk disablon atau dijadikan sticker.
            </p>
            <p>
              Kami memahami tantangan yang dihadapi oleh konveksi, seller kaos online, dan desainer freelance dalam mengubah logo berkualitas rendah menjadi desain yang tajam dan siap cetak.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {aboutMissionVision.map((card) => (
            <div key={card.title} className="studio-card p-6">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <card.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.description}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => {
            const { count, ref } = useCounter(stat.value, true, 1400);
            const displayValue = Number.isInteger(stat.value) ? count.toLocaleString('id-ID') : String(stat.value);
            return (
              <div key={stat.label} ref={ref} className="studio-card p-5 text-center">
                <stat.icon className="mx-auto h-5 w-5 text-primary" />
                <div className="mt-2 text-3xl font-extrabold text-slate-900">
                  {displayValue}
                  {stat.suffix}
                </div>
                <div className="mt-1 text-xs font-medium text-slate-500">{stat.label}</div>
              </div>
            );
          })}
        </div>

        <div className="studio-card p-6">
          <h3 className="text-lg font-bold text-slate-900">{isId ? 'Perjalanan Kami' : 'Our Journey'}</h3>
          <div className="relative mt-5 space-y-4">
            <div className="absolute bottom-2 left-5 top-2 w-px bg-slate-200" />
            {aboutTimeline.map((milestone) => (
              <div key={milestone.date} className="relative flex items-start gap-4">
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                  <milestone.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="font-mono text-xs font-semibold text-primary">{milestone.date}</div>
                  <h4 className="mt-1 text-sm font-bold text-slate-900">{milestone.title}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{milestone.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="studio-card p-6">
          <h3 className="text-lg font-bold text-slate-900">{isId ? 'Teknologi yang Digunakan' : 'Technology Stack'}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {aboutTechStack.map((tech) => (
              <div key={tech.name} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <tech.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{tech.name}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{tech.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="studio-card p-6">
          <h3 className="text-lg font-bold text-slate-900">{isId ? 'Tim Kami' : 'Our Team'}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {aboutTeam.map((member) => (
              <div key={member.name} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                  {member.initials}
                </div>
                <p className="text-sm font-bold text-slate-900">{member.name}</p>
                <p className="text-xs text-slate-500">{member.role}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="studio-card p-6">
          <h3 className="text-lg font-bold text-slate-900">{isId ? 'Mengapa Memilih Kami?' : 'Why Choose Us?'}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                <Zap className="h-4 w-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">{isId ? 'Proses Cepat' : 'Fast Processing'}</h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{isId ? 'Hasil redesign logo hanya dalam hitungan detik hingga menit.' : 'Logo redesign results are delivered within seconds to minutes.'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">{isId ? 'Keamanan Terjamin' : 'Secure by Design'}</h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{isId ? 'Gambar Anda diproses secara aman dan dihapus dari server setelah selesai.' : 'Your images are processed securely and removed from the server after completion.'}</p>
            </div>
          </div>
        </div>
      </div>
    </LegalShell>
  );
}

export default function LandingPage({ locale = 'id', onLocaleChange, onStart, authPanel, onNavigate, exampleJobs = [] }) {
  return <PublicLanding locale={locale} onLocaleChange={onLocaleChange} onStart={onStart} authPanel={authPanel} onNavigate={onNavigate} exampleJobs={exampleJobs} />;
}

export { AboutPage, ContactPage, PrivacyPage, TermsPage };
