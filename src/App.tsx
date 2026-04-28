import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  User, 
  MessageSquare, 
  Upload, 
  Search, 
  Download, 
  Image as ImageIcon, 
  Plus, 
  ListFilter,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  updateDoc,
  deleteDoc,
  doc,
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  limit 
} from 'firebase/firestore';
import { db, auth } from './lib/firebase';
import { handleFirestoreError } from './lib/error-handler';
import { FollowUpData, OperationType, ProgressData, ProgressOutcome, ProgressChannel } from './types';
import imageCompression from 'browser-image-compression';
import axios from 'axios';
import Papa from 'papaparse';

// Design Constants
const CATEGORIES = ['CS Follow-up', 'Progress', 'Admin Tracking'];

export default function App() {
  const [activeTab, setActiveTab] = useState(CATEGORIES[0]);
  const [activeProgressSubTab, setActiveProgressSubTab] = useState<'pending' | 'done'>('pending');
  const [progressFilterMonth, setProgressFilterMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0') + '-' + new Date().getFullYear());
  const [followups, setFollowups] = useState<FollowUpData[]>([]);
  const [progressList, setProgressList] = useState<ProgressData[]>([]);
  const [loading, setLoading] = useState(true);

  // CS Form State
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPic, setFormPic] = useState(''); // Empty by default for dynamic input
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [formCaption, setFormCaption] = useState('');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingScreenshotUrl, setExistingScreenshotUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Progress Form State
  const [selectedFollowupForProgress, setSelectedFollowupForProgress] = useState<FollowUpData | null>(null);
  const [progressOutcome, setProgressOutcome] = useState<ProgressOutcome | ''>('');
  const [progressChannels, setProgressChannels] = useState<ProgressChannel[]>([]);
  const [progressPic, setProgressPic] = useState('');
  const [progressDate, setProgressDate] = useState(new Date().toISOString().split('T')[0]);
  const [progressCaption, setProgressCaption] = useState('');
  const [progressFile, setProgressFile] = useState<File | null>(null);
  const [progressUploading, setProgressUploading] = useState(false);

  // Admin Tracking State
  const [searchPic, setSearchPic] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminCategory, setAdminCategory] = useState<'followups' | 'progress'>('followups');
  const [bulkDeleteMonth, setBulkDeleteMonth] = useState('');
  const [bulkDeleteCategory, setBulkDeleteCategory] = useState<'followups' | 'progress'>('followups');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Fetch data
  useEffect(() => {
    const qF = query(collection(db, 'followups'), orderBy('timestamp', 'desc'), limit(500));
    const unsubscribeF = onSnapshot(qF, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FollowUpData[];
      setFollowups(data);
      if (activeTab !== CATEGORIES[1]) setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'followups');
      setLoading(false);
    });

    const qP = query(collection(db, 'progress'), orderBy('timestamp', 'desc'), limit(500));
    const unsubscribeP = onSnapshot(qP, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProgressData[];
      setProgressList(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'progress');
      setLoading(false);
    });

    return () => {
      unsubscribeF();
      unsubscribeP();
    };
  }, [activeTab]);

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'dinalaundry21') {
      setIsAdminAuthenticated(true);
      setErrorMsg('');
    } else {
      setErrorMsg('Password admin salah!');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setErrorMsg('');
      try {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1024,
          useWebWorker: true,
        };
        const compressedFile = await imageCompression(file, options);
        setFormFile(compressedFile);
      } catch (error) {
        console.error('Compression error:', error);
        setErrorMsg('Gagal mengompres gambar.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If not editing, we MUST have a file. If editing, we can keep the old one.
    if (!formPic || !formCaption || !customerName || !customerPhone || (!formFile && !editingId)) {
      setErrorMsg('Semua field harus diisi.');
      return;
    }

    setUploading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let finalScreenshotUrl = existingScreenshotUrl;

      // 1. Upload to server if there's a new file
      if (formFile) {
        const formData = new FormData();
        formData.append('screenshot', formFile);
        formData.append('date', formDate);
        formData.append('pic', formPic);

        const uploadRes = await axios.post('/api/upload', formData);
        finalScreenshotUrl = uploadRes.data.url;

        if (!finalScreenshotUrl) {
          throw new Error('Gagal mendapatkan URL screenshot dari server.');
        }

        // If we were editing and uploaded a new file, we should delete the OLD one
        if (editingId && existingScreenshotUrl) {
           try {
             await axios.post('/api/delete-image', { screenshotUrl: existingScreenshotUrl });
           } catch (err) {
             console.warn('Failed to delete old image from Cloudinary:', err);
           }
        }
      }

      if (!finalScreenshotUrl) {
        throw new Error('Screenshot tidak ditemukan.');
      }

      // 2. Save to Firestore
      const monthYear = formDate.substring(5, 7) + '-' + formDate.substring(0, 4); // MM-YYYY
      
      const payload: any = {
        date: formDate,
        customerName: customerName,
        customerPhone: customerPhone,
        pic: formPic,
        caption: formCaption,
        screenshotUrl: finalScreenshotUrl,
        monthYear: monthYear,
        timestamp: serverTimestamp()
      };

      try {
        if (editingId) {
          await updateDoc(doc(db, 'followups', editingId), payload);
          setSuccessMsg('Data berhasil diperbarui!');
        } else {
          await addDoc(collection(db, 'followups'), payload);
          setSuccessMsg('Follow-up berhasil disimpan!');
        }
      } catch (fErr) {
        handleFirestoreError(fErr, editingId ? OperationType.UPDATE : OperationType.CREATE, 'followups');
      }

      // Reset form
      handleCancelEdit();
    } catch (error: any) {
      console.error('Submit error:', error);
      setErrorMsg(error.message || 'Gagal menyimpan data.');
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (f: FollowUpData) => {
    setEditingId(f.id || null);
    setFormDate(f.date);
    setCustomerName(f.customerName);
    setCustomerPhone(f.customerPhone);
    setFormPic(f.pic);
    setFormCaption(f.caption);
    setExistingScreenshotUrl(f.screenshotUrl);
    setFormFile(null); // Clear new file selection
    setErrorMsg('');
    setSuccessMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setExistingScreenshotUrl(null);
    setFormCaption('');
    setCustomerName('');
    setCustomerPhone('');
    setFormPic('');
    setFormFile(null);
    // Reset file input
    const fileInput = document.getElementById('screenshot-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (f: FollowUpData) => {
    if (!f.id) return;
    setConfirmDeleteId(f.id);
  };

  const executeDelete = async (f: FollowUpData) => {
    setDeletingIds(prev => new Set(prev).add(f.id!));
    setConfirmDeleteId(null);
    setErrorMsg('');
    setSuccessMsg('');
    
    try {
      // 1. Delete from Firestore first (primary data)
      await deleteDoc(doc(db, 'followups', f.id!));
      
      // 2. Attempt to delete from Cloudinary in background
      axios.post('/api/delete-image', { screenshotUrl: f.screenshotUrl }).catch(err => {
        console.warn('Background Cloudinary delete failed:', err);
      });
      
      setSuccessMsg('Data berhasil dihapus.');
      if (editingId === f.id) handleCancelEdit();
    } catch (error: any) {
      console.error('Delete error:', error);
      setErrorMsg(error.message || 'Gagal menghapus data.');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(f.id!);
        return next;
      });
    }
  };

  const filteredFollowups = useMemo(() => {
    return followups.filter(f => {
      const matchPic = f.pic.toLowerCase().includes(searchPic.toLowerCase());
      const matchMonth = filterMonth ? f.monthYear === filterMonth : true;
      const matchDate = filterDate ? f.date === filterDate : true;
      const matchCustomer = f.customerName?.toLowerCase().includes(searchPic.toLowerCase()) || 
                             f.customerPhone?.includes(searchPic);
      return (matchPic || matchCustomer) && matchMonth && matchDate;
    });
  }, [followups, searchPic, filterMonth, filterDate]);

  const pendingProgressFollowups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return followups.filter(f => {
      const fDate = new Date(f.date);
      fDate.setHours(0, 0, 0, 0);
      
      const diffTime = today.getTime() - fDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      const isOldEnough = diffDays >= 4;
      const isAlreadyProgressed = progressList.some(p => p.followupId === f.id);
      const matchMonth = progressFilterMonth ? f.monthYear === progressFilterMonth : true;
      
      return isOldEnough && !isAlreadyProgressed && matchMonth;
    });
  }, [followups, progressList, progressFilterMonth]);

  const doneProgressItems = useMemo(() => {
    return progressList.filter(p => {
      const matchMonth = progressFilterMonth ? p.monthYear === progressFilterMonth : true;
      return matchMonth;
    });
  }, [progressList, progressFilterMonth]);

  const filteredProgress = useMemo(() => {
    return progressList.filter(p => {
      const matchPic = p.pic.toLowerCase().includes(searchPic.toLowerCase());
      const matchMonth = filterMonth ? p.monthYear === filterMonth : true;
      const matchDate = filterDate ? p.date === filterDate : true;
      const matchCustomer = p.customerName?.toLowerCase().includes(searchPic.toLowerCase());
      return (matchPic || matchCustomer) && matchMonth && matchDate;
    });
  }, [progressList, searchPic, filterMonth, filterDate]);

  const handleProgressFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1200 });
        setProgressFile(compressed);
      } catch (e) {
        setErrorMsg('Gagal kompres gambar progress.');
      }
    }
  };

  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFollowupForProgress || !progressOutcome || !progressPic || !progressFile) {
      setErrorMsg('Lengkapi data progress dan upload bukti.');
      return;
    }

    setProgressUploading(true);
    try {
      // 1. Upload to Cloudinary folder "progress"
      const formData = new FormData();
      formData.append('screenshot', progressFile);
      formData.append('date', progressDate);
      formData.append('pic', progressPic);
      formData.append('targetFolder', 'progress');
      formData.append('customerName', selectedFollowupForProgress.customerName);

      const res = await axios.post('/api/upload', formData);
      const url = res.data.url;

      // 2. Save to Firestore
      const monthYear = progressDate.substring(5, 7) + '-' + progressDate.substring(0, 4);
      const payload: Omit<ProgressData, 'id'> = {
        followupId: selectedFollowupForProgress.id!,
        customerName: selectedFollowupForProgress.customerName,
        outcome: progressOutcome as ProgressOutcome,
        channels: progressChannels,
        pic: progressPic,
        date: progressDate,
        caption: progressCaption,
        screenshotUrl: url,
        monthYear,
        timestamp: serverTimestamp()
      };

      await addDoc(collection(db, 'progress'), payload);
      setSuccessMsg('Progress berhasil disimpan!');
      
      // Reset
      setSelectedFollowupForProgress(null);
      setProgressOutcome('');
      setProgressChannels([]);
      setProgressCaption('');
      setProgressFile(null);
    } catch (error: any) {
      setErrorMsg(error.message || 'Gagal simpan progress.');
    } finally {
      setProgressUploading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!bulkDeleteMonth) {
      setErrorMsg('Pilih bulan & tahun.');
      return;
    }
    if (!confirm(`Hapus SEMUA file Cloudinary di folder ${bulkDeleteCategory} untuk periode ${bulkDeleteMonth}?`)) return;

    setIsBulkDeleting(true);
    try {
      await axios.post('/api/bulk-delete', { 
        monthYear: bulkDeleteMonth, 
        category: bulkDeleteCategory 
      });
      setSuccessMsg('Bulk delete berhasil dilakukan.');
    } catch (e: any) {
      setErrorMsg('Gagal hapus massal: ' + e.message);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const downloadCSV = () => {
    const dataToExport = adminCategory === 'followups' ? filteredFollowups.map(f => ({
      Tanggal: f.date,
      Nama_Konsumen: f.customerName,
      No_HP: f.customerPhone,
      PIC: f.pic,
      Caption: f.caption,
      Bulan_Tahun: f.monthYear,
      URL_Screenshot: f.screenshotUrl
    })) : filteredProgress.map(p => ({
      Tanggal_Progress: p.date,
      Nama_Konsumen: p.customerName,
      Hasil: p.outcome,
      Media: p.channels.join(', '),
      PIC: p.pic,
      Keterangan: p.caption,
      URL_Screenshot: p.screenshotUrl
    }));

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tracking_followup_${new Date().toISOString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-natural-bg overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-natural-border bg-white p-6 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-natural-primary rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-serif text-lg font-bold text-natural-text-dark leading-none">Dina Laundry CS Tracking</h1>
              <p className="text-[10px] text-natural-text-muted uppercase tracking-wider mt-1">CS Follow-up Tracker</p>
            </div>
          </div>
          
            <nav className="space-y-1">
            {CATEGORIES.map((cat, idx) => (
              <button
                key={`nav-item-${cat}`}
                onClick={() => {
                  setActiveTab(cat);
                  handleCancelEdit();
                }}
                className={`w-full sidebar-link-natural text-left gap-3 ${
                  activeTab === cat 
                  ? 'bg-natural-border text-natural-text-dark' 
                  : 'text-natural-sidebar-link hover:bg-gray-50'
                }`}
              >
                {idx === 0 ? <MessageSquare className="w-5 h-5" /> : idx === 1 ? <CheckCircle2 className="w-5 h-5" /> : <ListFilter className="w-5 h-5" />}
                {cat}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-8 p-4 bg-gray-50 rounded-2xl border border-natural-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-natural-border flex items-center justify-center text-natural-text-dark font-bold text-xs">GP</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-natural-text-dark truncate">Gean Pratama</p>
              <p className="text-[10px] text-natural-text-muted">Created By</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {/* Global Messages */}
        <div className="max-w-7xl mx-auto mb-6">
          <AnimatePresence>
            {successMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0 }}
                className="mb-4 p-4 bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl font-medium flex items-center gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>{successMsg}</span>
                <button onClick={() => setSuccessMsg('')} className="ml-auto opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0 }}
                className="mb-4 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl font-medium flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="truncate max-w-md">{errorMsg}</span>
                <button onClick={() => setErrorMsg('')} className="ml-auto opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Image Preview Modal */}
        <AnimatePresence>
          {previewImageUrl && (
            <div 
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md cursor-zoom-out"
              onClick={() => setPreviewImageUrl(null)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  onClick={() => setPreviewImageUrl(null)}
                  className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 rounded-full"
                >
                  <X className="w-6 h-6" />
                </button>
                <img 
                  src={previewImageUrl} 
                  className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10" 
                  alt="Preview Screenshot"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {confirmDeleteId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl shadow-red-200/50"
              >
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto text-red-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-natural-text-dark text-center mb-2">Konfirmasi Hapus</h3>
                <p className="text-sm text-natural-text-muted text-center mb-6">
                  Apakah Anda yakin ingin menghapus data ini? Data dan screenshotnya akan terhapus permanen dari sistem.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={() => {
                      const f = followups.find(x => x.id === confirmDeleteId);
                      if (f) executeDelete(f);
                    }}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-200 transition-all"
                  >
                    Hapus
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeTab === CATEGORIES[0] ? (
            <motion.div
              key="cs-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 xl:grid-cols-12 gap-8 content-start"
            >
              <header className="xl:col-span-12 mb-2">
                <div className="space-y-1">
                  <h2 className="font-serif text-3xl text-natural-text-dark">Input Follow-up</h2>
                  <p className="text-natural-text-muted">Masukan detail follow-up konsumen untuk hari ini.</p>
                </div>
              </header>

              <section className="xl:col-span-12">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                  <div className="flex-shrink-0 card-natural p-4 min-w-[200px] border-l-4 border-l-natural-primary bg-natural-primary/5">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Total Follow-up</p>
                    <p className="text-2xl font-bold text-natural-text-dark">{followups.length}</p>
                    <p className="text-[10px] text-natural-primary/70 font-medium whitespace-nowrap">Seluruh Data Aktif</p>
                  </div>
                  <div className="flex-shrink-0 card-natural p-4 min-w-[200px] border-l-4 border-l-amber-400">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Hari Ini</p>
                    <p className="text-2xl font-bold text-natural-text-dark">
                      {followups.filter(f => f.date === new Date().toISOString().split('T')[0]).length}
                    </p>
                    <p className="text-[10px] text-amber-600 font-medium whitespace-nowrap">Input Konsumen Baru</p>
                  </div>
                  <div className="flex-shrink-0 card-natural p-4 min-w-[200px] border-l-4 border-l-red-400">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Pending Progress</p>
                    <p className="text-2xl font-bold text-natural-text-dark">{pendingProgressFollowups.length}</p>
                    <p className="text-[10px] text-red-600 font-medium whitespace-nowrap">Belum di-Follow Lanjut</p>
                  </div>
                  <div className="flex-shrink-0 card-natural p-4 min-w-[200px] border-l-4 border-l-green-400">
                    <p className="text-[10px] uppercase font-bold text-natural-text-muted mb-1">Done Progress</p>
                    <p className="text-2xl font-bold text-natural-text-dark">{doneProgressItems.length}</p>
                    <p className="text-[10px] text-green-600 font-medium whitespace-nowrap">Sudah Terupdate</p>
                  </div>
                </div>
              </section>

              <section className="xl:col-span-5 self-start">
                <div className="card-natural p-6">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-6">
                    <h3 className="text-sm font-bold text-natural-text-dark uppercase tracking-wider">
                      {editingId ? 'Edit Data Follow-up' : 'Data Input Follow-up'}
                    </h3>
                    {editingId && (
                      <button 
                        onClick={handleCancelEdit}
                        className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:underline"
                      >
                        <X className="w-3 h-3" /> BATAL EDIT
                      </button>
                    )}
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">Tanggal</label>
                        <input 
                          type="date" 
                          value={formDate || ''}
                          onChange={(e) => setFormDate(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">PIC Follow-up</label>
                        <input 
                          type="text" 
                          placeholder="Nama PIC..."
                          value={formPic || ''}
                          onChange={(e) => setFormPic(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">Nama Konsumen</label>
                        <input 
                          type="text" 
                          placeholder="Nama Konsumen..."
                          value={customerName || ''}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-natural-text-muted">No. HP Konsumen</label>
                        <input 
                          type="text" 
                          placeholder="08123..."
                          value={customerPhone || ''}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-natural-text-muted">Caption / Hasil Follow-up</label>
                      <textarea 
                        rows={4}
                        placeholder="Tuliskan detail percakapan..."
                        value={formCaption || ''}
                        onChange={(e) => setFormCaption(e.target.value)}
                        className="w-full px-3 py-2 border border-natural-border rounded-lg text-sm focus:ring-1 focus:ring-natural-primary outline-none placeholder:text-gray-300"
                        required
                      ></textarea>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-natural-text-muted">Screenshoot Bukti</label>
                      <input 
                        type="file" 
                        id="screenshot-upload"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label 
                        htmlFor="screenshot-upload"
                        className={`block border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                          formFile 
                          ? 'border-natural-primary bg-natural-bg/50' 
                          : 'border-natural-border bg-gray-50 hover:border-natural-primary'
                        }`}
                      >
                        {formFile ? (
                          <div className="flex flex-col items-center gap-1">
                            <CheckCircle2 className="w-8 h-8 text-natural-primary" />
                            <p className="text-[11px] font-bold text-natural-text-dark">{formFile.name}</p>
                            <p className="text-[9px] text-natural-text-muted italic">Sudah dikompres otomatis</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-natural-text-muted">
                            <ImageIcon className="w-8 h-8 opacity-50" />
                            <p className="text-[11px] font-bold">Upload Bukti (Max 5MB)</p>
                            <p className="text-[9px] italic">Simpan ke Cloudinary</p>
                          </div>
                        )}
                      </label>
                    </div>

                    <button 
                      type="submit"
                      disabled={uploading}
                      className={`w-full py-3 rounded-xl font-semibold text-sm shadow-md mt-2 flex items-center justify-center gap-2 transition-all ${
                        editingId ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'btn-natural-primary'
                      }`}
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
                      {uploading ? 'Menyimpan...' : (editingId ? 'Perbarui Data Follow-up' : 'Submit & Simpan Cloudinary')}
                    </button>
                  </form>
                </div>
              </section>

              <section className="xl:col-span-7 space-y-6">
                <div className="card-natural flex flex-col h-full min-h-[400px]">
                  <div className="p-4 border-b border-gray-50 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-natural-text-dark uppercase tracking-wider">Aktivitas Terakhir</h3>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="grid divide-y divide-gray-50">
                      {loading ? (
                        <div className="py-20 text-center"><LoadingSpinner /></div>
                      ) : followups.length === 0 ? (
                        <div className="py-20 text-center text-natural-text-muted text-xs">Belum ada aktivitas.</div>
                      ) : (
                        followups.slice(0, 8).map((f, idx) => (
                          <div key={`aktivitas-${f.id || idx}`} className="group p-4 flex gap-4 hover:bg-gray-50/50 transition-colors relative">
                            <div className="relative group/img cursor-zoom-in" onClick={() => setPreviewImageUrl(f.screenshotUrl)}>
                              <img src={f.screenshotUrl} className="w-16 h-16 rounded-lg object-cover bg-gray-100 flex-shrink-0 border border-gray-100" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                <Search className="w-4 h-4 text-white" />
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold text-natural-text-dark">{f.date}</span>
                                <span className="text-[10px] text-natural-text-muted whitespace-nowrap italic">— {f.pic}</span>
                              </div>
                              <p className="text-[10px] font-bold text-natural-text-dark mb-0.5">{f.customerName}</p>
                              <p className="text-[10px] text-natural-text-dark line-clamp-1 leading-relaxed opacity-70">{f.caption}</p>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                              <button 
                                onClick={() => handleEdit(f)}
                                className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDelete(f)}
                                disabled={f.id ? deletingIds.has(f.id) : false}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  f.id && deletingIds.has(f.id) 
                                  ? 'bg-gray-100 text-gray-400' 
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                                }`}
                                title="Hapus"
                              >
                                {f.id && deletingIds.has(f.id) ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          ) : activeTab === CATEGORIES[1] ? (
            <motion.div
              key="progress-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 xl:grid-cols-12 gap-8 content-start"
            >
              <header className="xl:col-span-12 mb-2">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div className="space-y-1">
                    <h2 className="font-serif text-3xl text-natural-text-dark font-bold">Progress Follow-up</h2>
                    <p className="text-natural-text-muted">Pengecekan hasil follow-up setelah 4 hari.</p>
                  </div>
                  <div className="flex items-center gap-3 bg-white p-1 rounded-2xl shadow-sm border border-natural-border">
                    <button 
                      onClick={() => setActiveProgressSubTab('pending')}
                      className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        activeProgressSubTab === 'pending' 
                        ? 'bg-red-500 text-white shadow-lg shadow-red-200' 
                        : 'text-natural-text-muted hover:text-natural-text-dark'
                      }`}
                    >
                      Pending ({pendingProgressFollowups.length})
                    </button>
                    <button 
                      onClick={() => setActiveProgressSubTab('done')}
                      className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        activeProgressSubTab === 'done' 
                        ? 'bg-green-500 text-white shadow-lg shadow-green-200' 
                        : 'text-natural-text-muted hover:text-natural-text-dark'
                      }`}
                    >
                      Done ({doneProgressItems.length})
                    </button>
                    <div className="h-6 w-[1px] bg-gray-200 mx-2" />
                    <div className="relative group">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-text-muted group-focus-within:text-natural-primary transition-colors" />
                      <input 
                        type="text" 
                        placeholder="MM-YYYY"
                        value={progressFilterMonth}
                        onChange={(e) => setProgressFilterMonth(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl text-xs font-bold focus:bg-white focus:border-natural-primary outline-none transition-all w-32"
                      />
                    </div>
                  </div>
                </div>
              </header>

              {/* Progress Selection */}
              <section className="xl:col-span-4 space-y-4">
                <div className="card-natural p-6 flex flex-col h-[600px]">
                  <div className="flex items-center gap-2 border-b border-gray-50 pb-4 mb-4">
                    {activeProgressSubTab === 'pending' ? <ListFilter className="w-5 h-5 text-red-500" /> : <CheckCircle2 className="w-5 h-5 text-green-500" />}
                    <div>
                      <h3 className="text-sm font-bold text-natural-text-dark uppercase tracking-wider">
                        {activeProgressSubTab === 'pending' ? 'Belum Di-follow Lanjut' : 'Sudah Terupdate'}
                      </h3>
                      <p className="text-[10px] text-natural-text-muted">Periode: {progressFilterMonth || 'Semua'}</p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                    {activeProgressSubTab === 'pending' ? (
                      pendingProgressFollowups.length === 0 ? (
                        <div className="py-20 text-center text-natural-text-muted text-xs">
                          Tidak ada data pending di periode ini.
                        </div>
                      ) : (
                        pendingProgressFollowups.map((f, idx) => (
                          <button
                            key={`pending-${f.id || idx}`}
                            onClick={() => setSelectedFollowupForProgress(f)}
                            className={`w-full text-left p-4 rounded-xl border transition-all ${
                              selectedFollowupForProgress?.id === f.id
                              ? 'bg-natural-primary/10 border-natural-primary shadow-sm'
                              : 'bg-gray-50/50 border-transparent hover:border-gray-200 shadow-sm'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[9px] font-bold text-natural-text-muted uppercase tracking-tighter">{f.date}</span>
                              <span className="text-[9px] bg-white px-2 py-0.5 rounded border border-natural-border font-bold">{f.pic}</span>
                            </div>
                            <p className="font-bold text-natural-text-dark text-sm truncate">{f.customerName}</p>
                            <p className="text-[10px] text-natural-text-muted truncate mb-2">{f.customerPhone}</p>
                            <div className="flex items-center gap-1 text-natural-primary">
                              <span className="text-[8px] font-black uppercase tracking-widest">Update Sekarang</span>
                              <Plus className="w-3 h-3" />
                            </div>
                          </button>
                        ))
                      )
                    ) : (
                      doneProgressItems.length === 0 ? (
                        <div className="py-20 text-center text-natural-text-muted text-xs">
                          Belum ada progress di periode ini.
                        </div>
                      ) : (
                        doneProgressItems.map((p, idx) => (
                          <div
                            key={`done-${p.id || idx}`}
                            className="w-full p-4 rounded-xl border border-natural-border bg-white shadow-sm"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[9px] font-bold text-natural-text-muted uppercase tracking-tighter">{p.date}</span>
                              <span className="text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-black uppercase">{p.outcome}</span>
                            </div>
                            <p className="font-bold text-natural-text-dark text-sm truncate">{p.customerName}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {p.channels.map((c) => (
                                <span key={`done-ch-${p.id}-${c}`} className="text-[8px] bg-gray-100 px-1 rounded font-bold uppercase">{c}</span>
                              ))}
                            </div>
                            <button 
                              onClick={() => setPreviewImageUrl(p.screenshotUrl)}
                              className="mt-3 flex items-center gap-1 text-[9px] font-black text-natural-primary uppercase tracking-widest hover:underline"
                            >
                              <Search className="w-3 h-3" /> Lihat Bukti
                            </button>
                          </div>
                        ))
                      )
                    )}
                  </div>
                </div>
              </section>

              {/* Progress Update Form */}
              <section className="xl:col-span-8 self-start">
                {selectedFollowupForProgress ? (
                  <form onSubmit={handleProgressSubmit} className="card-natural p-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="p-4 bg-natural-primary/5 rounded-2xl border border-natural-primary/10">
                          <h4 className="text-[10px] font-black text-natural-primary uppercase tracking-[0.2em] mb-4">Target Update</h4>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-natural-primary font-bold text-lg border border-natural-primary/10">
                              {selectedFollowupForProgress.customerName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-lg font-serif font-bold text-natural-text-dark leading-tight">{selectedFollowupForProgress.customerName}</p>
                              <p className="text-xs text-natural-text-muted">{selectedFollowupForProgress.customerPhone}</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">Hasil Pengecekan</label>
                          <div className="grid gap-2">
                            {Object.values(ProgressOutcome).map((outcome) => (
                              <button
                                key={`outcome-opt-${outcome}`}
                                type="button"
                                onClick={() => setProgressOutcome(outcome)}
                                className={`w-full px-4 py-3 text-left rounded-xl text-xs font-semibold border transition-all flex items-center justify-between ${
                                  progressOutcome === outcome
                                  ? 'bg-natural-primary text-white border-natural-primary shadow-lg shadow-natural-primary/20'
                                  : 'bg-white text-natural-text-dark border-natural-border hover:bg-gray-50'
                                }`}
                              >
                                {outcome}
                                {progressOutcome === outcome && <CheckCircle2 className="w-4 h-4" />}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">Media Feedback (Multiple)</label>
                          <div className="flex flex-wrap gap-2">
                            {Object.values(ProgressChannel).map((channel) => {
                              const isSelected = progressChannels.includes(channel);
                              return (
                                <button
                                  key={`channel-opt-${channel}`}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) setProgressChannels(prev => prev.filter(c => c !== channel));
                                    else setProgressChannels(prev => [...prev, channel]);
                                  }}
                                  className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                                    isSelected
                                    ? 'bg-natural-text-dark text-white border-natural-text-dark'
                                    : 'bg-white text-natural-text-muted border-natural-border hover:border-natural-primary'
                                  }`}
                                >
                                  {channel}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">PIC Progress</label>
                            <input 
                              type="text" 
                              placeholder="Nama Anda..."
                              value={progressPic}
                              onChange={(e) => setProgressPic(e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">Tanggal</label>
                            <input 
                              type="date" 
                              value={progressDate}
                              onChange={(e) => setProgressDate(e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">Keterangan Tambahan</label>
                          <textarea 
                            rows={3}
                            placeholder="Detail progress..."
                            value={progressCaption}
                            onChange={(e) => setProgressCaption(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:ring-1 focus:ring-natural-primary outline-none"
                          ></textarea>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-black text-natural-text-muted uppercase tracking-wider">Upload Bukti Progress</label>
                          <input 
                            type="file" 
                            id="progress-upload"
                            accept="image/*"
                            onChange={handleProgressFileUpload}
                            className="hidden"
                          />
                          <label 
                            htmlFor="progress-upload"
                            className={`block border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                              progressFile 
                              ? 'border-natural-primary bg-natural-primary/5' 
                              : 'border-natural-border bg-gray-50 hover:border-natural-primary hover:bg-white animate-soft-pulse'
                            }`}
                          >
                            {progressUploading ? (
                              <div className="flex flex-col items-center gap-2">
                                <Loader2 className="w-8 h-8 animate-spin text-natural-primary" />
                                <p className="text-[10px] font-bold text-natural-text-dark">Sedang Mengunggah...</p>
                              </div>
                            ) : progressFile ? (
                              <div className="flex flex-col items-center gap-1">
                                <CheckCircle2 className="w-8 h-8 text-natural-primary" />
                                <p className="text-[11px] font-bold text-natural-text-dark">{progressFile.name}</p>
                                <p className="text-[9px] text-natural-text-muted italic">Format progress otomatis diaktifkan</p>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-natural-text-muted">
                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-1">
                                  <Upload className="w-5 h-5 opacity-50" />
                                </div>
                                <p className="text-[11px] font-black uppercase tracking-[0.1em]">Klik untuk Unggah</p>
                                <p className="text-[9px] italic opacity-70">Folder: Cloudinary/Progress</p>
                              </div>
                            )}
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-gray-50 flex gap-4">
                      <button 
                        type="button" 
                        onClick={() => setSelectedFollowupForProgress(null)}
                        className="px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all"
                      >
                        Batal
                      </button>
                      <button 
                        type="submit"
                        disabled={progressUploading}
                        className="flex-1 py-4 bg-natural-text-dark hover:bg-black text-white font-black uppercase tracking-[0.2em] text-sm rounded-xl shadow-xl shadow-gray-200 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                      >
                        {progressUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                        {progressUploading ? 'Memproses...' : 'Simpan Progress Follow-up'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="card-natural p-20 flex flex-col items-center justify-center text-center space-y-4 bg-natural-primary/5 border-dashed border-2 border-natural-primary/20">
                    <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center text-natural-primary">
                      <MessageSquare className="w-10 h-10 opacity-30" />
                    </div>
                    <div className="max-w-md">
                      <h3 className="font-serif text-2xl text-natural-text-dark">Pilih Data Untuk Update</h3>
                      <p className="text-sm text-natural-text-muted mt-2">
                        Silakan pilih salah satu data dari menu antrian 4 hari di sebelah kiri untuk melakukan update progress follow-up.
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </motion.div>
          ) : (
            <motion.div
              key="admin-tracking"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {!isAdminAuthenticated ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <form onSubmit={handleAdminAuth} className="card-natural p-8 max-w-sm w-full space-y-6">
                    <div className="text-center space-y-2">
                       <AlertCircle className="w-12 h-12 text-natural-primary mx-auto opacity-20" />
                       <h2 className="font-serif text-2xl text-natural-text-dark">Akses Terbatas</h2>
                       <p className="text-xs text-natural-text-muted">Masukkan password admin dinalaundry21 untuk melihat tracking.</p>
                    </div>
                    <div className="space-y-2">
                      <input 
                        type="password" 
                        placeholder="Password..."
                        value={adminPassword || ''}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-natural-border rounded-xl focus:outline-none focus:ring-1 focus:ring-natural-primary text-center tracking-widest"
                      />
                      {errorMsg && <p className="text-[10px] text-red-500 font-bold text-center">{errorMsg}</p>}
                    </div>
                    <button className="w-full py-3 btn-natural-primary rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98]">
                      Buka Akses Admin
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-gray-100 mb-8">
                    <div className="space-y-1">
                      <h2 className="font-serif text-4xl text-natural-text-dark tracking-tight font-bold">Admin Tracking Center</h2>
                      <div className="flex items-center gap-4 mt-4">
                        <button 
                          onClick={() => setAdminCategory('followups')}
                          className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                            adminCategory === 'followups'
                            ? 'bg-natural-primary text-white border-natural-primary shadow-lg shadow-natural-primary/20'
                            : 'bg-white text-natural-text-muted border-natural-border hover:border-natural-primary'
                          }`}
                        >
                          Follow-up Awal
                        </button>
                        <button 
                          onClick={() => setAdminCategory('progress')}
                          className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                            adminCategory === 'progress'
                            ? 'bg-natural-text-dark text-white border-natural-text-dark shadow-lg shadow-gray-200'
                            : 'bg-white text-natural-text-muted border-natural-border hover:border-natural-primary'
                          }`}
                        >
                          Data Progress
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="bg-red-50 p-4 rounded-2xl border border-red-100 flex items-center gap-4">
                        <div>
                          <p className="text-[9px] font-black uppercase text-red-600 tracking-wider">Cloudinary Cleanup</p>
                          <div className="flex items-center gap-2 mt-1">
                            <input 
                              type="text" 
                              placeholder="MM-YYYY" 
                              value={bulkDeleteMonth} 
                              onChange={(e) => setBulkDeleteMonth(e.target.value)} 
                              className="w-24 px-2 py-1 bg-white border border-red-200 rounded text-xs focus:outline-none" 
                            />
                            <select 
                              value={bulkDeleteCategory} 
                              onChange={(e) => setBulkDeleteCategory(e.target.value as any)}
                              className="px-2 py-1 bg-white border border-red-200 rounded text-xs focus:outline-none"
                            >
                              <option value="followups">Followup</option>
                              <option value="progress">Progress</option>
                            </select>
                            <button 
                              onClick={handleBulkDelete}
                              disabled={isBulkDeleting}
                              className="p-1 px-3 bg-red-600 text-white rounded font-bold text-[10px] hover:bg-red-700 transition-colors"
                            >
                              {isBulkDeleting ? '...' : 'Hapus Massal'}
                            </button>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={downloadCSV}
                        className="flex items-center gap-2 bg-natural-text-dark text-white px-6 py-4 rounded-2xl hover:opacity-90 transition-all font-black text-xs shadow-2xl"
                      >
                        <Download className="w-4 h-4" /> Export {adminCategory === 'followups' ? 'Followups' : 'Progress'} (.CSV)
                      </button>
                    </div>
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 card-natural p-5 shadow-sm">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-text-muted"><Search className="w-4 h-4" /></span>
                      <input type="text" placeholder="Cari PIC/Konsumen..." value={searchPic || ''} onChange={(e) => setSearchPic(e.target.value)} className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-natural-primary" />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-text-muted"><Calendar className="w-4 h-4" /></span>
                      <input type="date" value={filterDate || ''} onChange={(e) => setFilterDate(e.target.value)} className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-natural-primary" />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-text-muted"><ListFilter className="w-4 h-4" /></span>
                      <input type="text" placeholder="MM-YYYY (e.g. 04-2026)" value={filterMonth || ''} onChange={(e) => setFilterMonth(e.target.value)} className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-natural-primary" />
                    </div>
                    <div className="flex items-center justify-end">
                      <span className="text-[10px] font-black text-natural-text-muted tracking-[0.2em] uppercase">Showing {adminCategory === 'followups' ? filteredFollowups.length : filteredProgress.length} results</span>
                    </div>
                  </div>

                  <div className="card-natural overflow-hidden mt-6">
                    <div className="overflow-x-auto">
                      {adminCategory === 'followups' ? (
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-gray-50 text-[10px] uppercase font-black text-natural-text-muted border-b border-natural-border">
                            <tr>
                              <th className="px-6 py-5">Tanggal</th>
                              <th className="px-6 py-5">Konsumen</th>
                              <th className="px-6 py-5">WhatsApp/HP</th>
                              <th className="px-6 py-5">PIC</th>
                              <th className="px-6 py-5">Keterangan</th>
                              <th className="px-6 py-5 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="text-xs text-natural-text-dark divide-y divide-gray-50">
                            {filteredFollowups.map((f, idx) => (
                              <tr key={`admin-f-${f.id || idx}`} className="hover:bg-natural-bg/30 transition-colors">
                                <td className="px-6 py-4 font-semibold">{f.date}</td>
                                <td className="px-6 py-4 font-bold">{f.customerName}</td>
                                <td className="px-6 py-4">{f.customerPhone}</td>
                                <td className="px-6 py-4 italic">{f.pic}</td>
                                <td className="px-6 py-4 max-w-[200px] truncate">{f.caption}</td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <button 
                                      onClick={() => setPreviewImageUrl(f.screenshotUrl)}
                                      className="text-natural-primary font-bold hover:underline"
                                    >
                                      Detail
                                    </button>
                                    <button onClick={() => { setActiveTab(CATEGORIES[0]); handleEdit(f); }} className="text-amber-500 hover:text-amber-600 transition-colors">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => handleDelete(f)} 
                                      disabled={f.id ? deletingIds.has(f.id) : false}
                                      className={`${f.id && deletingIds.has(f.id) ? 'text-gray-400' : 'text-red-500 hover:text-red-600'} transition-colors`}
                                    >
                                      {f.id && deletingIds.has(f.id) ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-natural-text-dark text-[10px] uppercase font-black text-white/70 border-b border-white/10">
                            <tr>
                              <th className="px-6 py-5">Tanggal Progress</th>
                              <th className="px-6 py-5">Konsumen</th>
                              <th className="px-6 py-5">Hasil</th>
                              <th className="px-6 py-5">Media</th>
                              <th className="px-6 py-5">PIC Progress</th>
                              <th className="px-6 py-5 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="text-xs text-natural-text-dark divide-y divide-gray-50">
                            {filteredProgress.map((p, idx) => (
                              <tr key={`admin-p-${p.id || idx}`} className="hover:bg-natural-bg/30 transition-colors">
                                <td className="px-6 py-4 font-semibold">{p.date}</td>
                                <td className="px-6 py-4 font-bold">{p.customerName}</td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-1 rounded text-[9px] font-bold ${
                                    p.outcome === ProgressOutcome.ADA_FEEDBACK ? 'bg-green-100 text-green-700' :
                                    p.outcome === ProgressOutcome.TIDAK_ADA_RESPON ? 'bg-red-100 text-red-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {p.outcome}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-wrap gap-1">
                                    {p.channels.map((c) => (
                                      <span key={`admin-pr-ch-${p.id}-${c}`} className="text-[8px] bg-gray-100 px-1 rounded uppercase font-bold">{c}</span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-6 py-4 italic font-medium">{p.pic}</td>
                                <td className="px-6 py-4 text-right">
                                  <button 
                                    onClick={() => setPreviewImageUrl(p.screenshotUrl)}
                                    className="text-natural-primary font-bold hover:underline"
                                  >
                                    Lihat Bukti
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center space-x-2">
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
    </div>
  );
}
