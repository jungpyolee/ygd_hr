"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import {
  Trash2,
  Palette,
  ShieldAlert,
  UserCheck,
  Edit2,
  X,
  Phone,
  CreditCard,
  FileText,
  UploadCloud,
  FileCheck,
  Briefcase,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";

// 🚀 스키마 100% 반영된 인터페이스
interface Profile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  department: string | null;
  position: string | null;
  role: string;
  target_in_time: string | null;
  target_out_time: string | null;
  created_at: string;
  join_date: string | null;
  health_cert_verified: boolean | null;
  employment_contract_url: string | null;
  bank_account_copy_url: string | null;
  resident_register_url: string | null;
  health_cert_url: string | null;
  color_hex: string;
  account_number: string | null;
  bank_name: string | null;
  health_cert_date: string | null;
  employment_type: string | null;
  work_locations: string[] | null;
  cafe_positions: string[] | null;
  hourly_wage: number | null;
  insurance_type: string | null;
}

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "정규직" },
  { value: "part_time_fixed", label: "고정 알바" },
  { value: "part_time_daily", label: "일일 알바" },
];

const WORK_LOCATION_OPTIONS = [
  { value: "factory", label: "공장" },
  { value: "cafe", label: "카페" },
  { value: "catering", label: "케이터링" },
];

const CAFE_POSITION_OPTIONS = [
  { value: "hall", label: "홀" },
  { value: "kitchen", label: "주방" },
  { value: "showroom", label: "쇼룸" },
];

// 파일 업로드용 키 타입
type DocKey = "employment_contract_url" | "health_cert_url";

interface WorkDefault {
  id: string;
  profile_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  work_location: string;
  cafe_positions: string[];
  is_active: boolean;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function generateTimeOptions(startH: number, endH: number) {
  const opts: string[] = [];
  for (let h = startH; h <= endH; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    if (h < endH) opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
}

export default function AdminEmployeesPage() {
  const [uploading, setUploading] = useState(false);

  const [editingEmployee, setEditingEmployee] = useState<Profile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [fileDeleteConfirm, setFileDeleteConfirm] = useState<DocKey | null>(
    null,
  );

  // 항목이 많으므로 객체 하나로 묶어서 폼 상태 관리
  const [editForm, setEditForm] = useState<Partial<Profile>>({});

  // work_defaults 상태
  const [workDefaults, setWorkDefaults] = useState<WorkDefault[]>([]);
  const [workDefaultsLoading, setWorkDefaultsLoading] = useState(false);
  const [editingDefault, setEditingDefault] = useState<
    (Partial<WorkDefault> & { day_of_week: number }) | null
  >(null);
  const [savingDefault, setSavingDefault] = useState(false);

  const {
    data: employees = [],
    isLoading: loading,
    mutate: mutateEmployees,
  } = useSWR(
    "admin-employees-list",
    async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) return [];
      return (data as Profile[]) ?? [];
    },
    { dedupingInterval: 60_000, revalidateOnFocus: false },
  );

  const handleColorChange = async (id: string, newColor: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ color_hex: newColor })
      .eq("id", id);
    if (error) {
      toast.error("색상 변경에 실패했어요", {
        description: "다시 시도해주세요",
      });
      mutateEmployees(); // 롤백
    } else {
      mutateEmployees((prev) =>
        prev?.map((emp) =>
          emp.id === id ? { ...emp, color_hex: newColor } : emp,
        ),
      );
    }
  };

  const handleDeleteEmployee = async (id: string, name: string) => {
    setDeleteConfirm({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const supabase = createClient();
    const { id, name } = deleteConfirm;
    setDeleteConfirm(null);
    const { error } = await supabase.rpc("delete_user_admin", {
      target_user_id: id,
    });
    if (!error) {
      toast.success(`${name}님이 삭제됐어요`);
      mutateEmployees((prev) => prev?.filter((emp) => emp.id !== id));
    } else {
      toast.error("삭제에 실패했어요", { description: "다시 시도해주세요" });
    }
  };

  const openEditModal = async (employee: Profile) => {
    setEditingEmployee(employee);
    setEditForm({ ...employee });
    await fetchWorkDefaults(employee.id);
  };

  const fetchWorkDefaults = async (profileId: string) => {
    const supabase = createClient();
    setWorkDefaultsLoading(true);
    const { data } = await supabase
      .from("work_defaults")
      .select("*")
      .eq("profile_id", profileId)
      .order("day_of_week");
    if (data) setWorkDefaults(data as WorkDefault[]);
    setWorkDefaultsLoading(false);
  };

  const handleSaveWorkDefault = async () => {
    if (!editingDefault || !editingEmployee) return;
    const supabase = createClient();
    setSavingDefault(true);
    const {
      day_of_week,
      start_time,
      end_time,
      work_location,
      cafe_positions,
      id,
    } = editingDefault;
    if (!start_time || !end_time || !work_location) {
      toast.error("시작 시간, 종료 시간, 근무 장소를 모두 입력해주세요.");
      setSavingDefault(false);
      return;
    }
    if (id) {
      // UPDATE
      const { error } = await supabase
        .from("work_defaults")
        .update({
          start_time,
          end_time,
          work_location,
          cafe_positions: cafe_positions || [],
        })
        .eq("id", id);
      if (error) {
        toast.error("저장에 실패했어요", { description: error.message });
      } else {
        toast.success("기본 근무 패턴을 수정했어요");
      }
    } else {
      // INSERT
      const { error } = await supabase.from("work_defaults").insert({
        profile_id: editingEmployee.id,
        day_of_week,
        start_time,
        end_time,
        work_location,
        cafe_positions: cafe_positions || [],
      });
      if (error) {
        toast.error("저장에 실패했어요", { description: error.message });
      } else {
        toast.success("기본 근무 패턴을 추가했어요");
      }
    }
    setSavingDefault(false);
    setEditingDefault(null);
    fetchWorkDefaults(editingEmployee.id);
  };

  const handleDeleteWorkDefault = async (id: string) => {
    if (!editingEmployee) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("work_defaults")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("삭제에 실패했어요");
    } else {
      toast.success("기본 근무 패턴을 삭제했어요");
      fetchWorkDefaults(editingEmployee.id);
    }
  };

  const handleFormChange = (field: keyof Profile, value: any) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async () => {
    if (!editingEmployee || !editForm.name?.trim())
      return toast.error("이름을 입력해주세요.");
    const supabase = createClient();

    // 불변 컬럼 제외 후 업데이트
    const { id: _id, email: _email, created_at: _ca, ...safeForm } = editForm;
    const { error } = await supabase
      .from("profiles")
      .update(safeForm)
      .eq("id", editingEmployee.id);

    if (error)
      return toast.error("수정에 실패했어요", {
        description: "다시 시도해주세요",
      });

    // 즉시 캐시 반영
    mutateEmployees((prev) =>
      prev?.map((emp) =>
        emp.id === editingEmployee.id
          ? ({ ...emp, ...editForm } as Profile)
          : emp,
      ),
    );
    toast.success("정보를 수정했어요");
    setEditingEmployee(null);
  };

  // 🚀 프라이빗 파일 업로드 핸들러 (hr-documents 버킷 사용, '경로'만 저장)
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    column: DocKey,
  ) => {
    if (!editingEmployee || !e.target.files || e.target.files.length === 0)
      return;
    const supabase = createClient();
    const file = e.target.files[0];
    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${
        editingEmployee.id
      }/${column}_${Date.now()}.${fileExt}`;

      // 1. Private 버킷에 업로드
      const { error: uploadError } = await supabase.storage
        .from("hr-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      // 2. DB에는 경로(filePath)만 저장
      await supabase
        .from("profiles")
        .update({ [column]: filePath })
        .eq("id", editingEmployee.id);

      setEditingEmployee({ ...editingEmployee, [column]: filePath });
      setEditForm((prev) => ({ ...prev, [column]: filePath }));
      mutateEmployees((prev) =>
        prev?.map((emp) =>
          emp.id === editingEmployee.id ? { ...emp, [column]: filePath } : emp,
        ),
      );

      toast.success("서류를 업로드했어요");
    } catch (err) {
      console.error(err);
      toast.error("업로드에 실패했어요", { description: "다시 시도해주세요" });
    } finally {
      setUploading(false);
    }
  };

  // 🚀 프라이빗 파일 열람 핸들러 (60초짜리 임시 서명 URL 생성)
  const handleViewDocument = async (path: string) => {
    // 구버전 호환 (이미 http로 시작하는 퍼블릭 URL이 저장되어 있다면 그냥 열기)
    if (path.startsWith("http")) {
      window.open(path, "_blank");
      return;
    }
    const supabase = createClient();

    // 임시 열람 권한 생성
    const { data, error } = await supabase.storage
      .from("hr-documents")
      .createSignedUrl(path, 60);

    if (error || !data) {
      console.error(error);
      toast.error("파일을 불러올 권한이 없거나 삭제된 파일입니다.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  };

  // 파일 삭제 핸들러 (DB URL null 처리)
  const handleFileDelete = (column: DocKey) => {
    setFileDeleteConfirm(column);
  };

  const confirmFileDelete = async () => {
    if (!editingEmployee || !fileDeleteConfirm) return;
    const supabase = createClient();
    const column = fileDeleteConfirm;
    const filePath = editingEmployee[column];
    setFileDeleteConfirm(null);

    // Storage에서 실제 파일 삭제 (http URL이 아닌 경로 형태일 때만)
    if (filePath && !filePath.startsWith("http")) {
      await supabase.storage.from("hr-documents").remove([filePath]);
    }

    await supabase
      .from("profiles")
      .update({ [column]: null })
      .eq("id", editingEmployee.id);
    setEditingEmployee({ ...editingEmployee, [column]: null });
    setEditForm((prev) => ({ ...prev, [column]: null }));
    mutateEmployees((prev) =>
      prev?.map((emp) =>
        emp.id === editingEmployee.id ? { ...emp, [column]: null } : emp,
      ),
    );
    toast.success("서류를 삭제했어요");
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-64">
        <div className="cat-spinner-lg" />
      </div>
    );

  return (
    <div className="max-w-4xl animate-in fade-in duration-500 pb-20 relative">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#191F28] mb-1">직원 관리</h1>
        <p className="text-[14px] text-[#8B95A1]">
          인사 정보, 근무 조건, 증빙 서류를 통합 관리하세요.
        </p>
      </div>

      <div className="space-y-4">
        {employees.map((employee) => {
          const isAdmin = employee.role === "admin";
          const isHealthCertExpired =
            employee.health_cert_date &&
            new Date(employee.health_cert_date) < new Date();

          return (
            <div
              key={employee.id}
              className="bg-white rounded-[20px] p-5 sm:p-6 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row sm:items-center justify-between gap-5 transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
            >
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full">
                <div className="flex items-start sm:items-center gap-4 shrink-0">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-[18px] font-bold text-white shadow-sm shrink-0"
                    style={{ backgroundColor: employee.color_hex || "#8B95A1" }}
                  >
                    {employee.name?.charAt(0)}
                  </div>
                  <div className="sm:w-[130px]">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[18px] font-bold text-[#191F28]">
                        {employee.name}
                      </p>
                      {isAdmin && (
                        <span className="bg-[#E8F3FF] text-[#3182F6] text-[11px] font-bold px-1.5 py-0.5 rounded-md">
                          관리자
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] font-medium text-[#4E5968] mb-0.5">
                      {employee.department || "소속 없음"}{" "}
                      {employee.position ? `· ${employee.position}` : ""}
                    </p>
                    <p className="text-[11px] text-[#8B95A1]">
                      입사:{" "}
                      {employee.join_date
                        ? employee.join_date.replace(/-/g, ".")
                        : "미정"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col justify-center gap-3 flex-1 bg-[#F9FAFB] sm:bg-transparent p-4 sm:p-0 rounded-xl">
                  {/* 주요 정보 요약 */}
                  <div className="flex flex-wrap gap-4 sm:gap-6">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-[#8B95A1]" />
                      <p className="text-[13px] font-medium text-[#4E5968]">
                        {employee.phone || (
                          <span className="text-[#D1D6DB]">미입력</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-[#8B95A1]" />
                      <p className="text-[13px] font-medium text-[#4E5968]">
                        {employee.bank_name ? `${employee.bank_name} ` : ""}
                        {employee.account_number || (
                          <span className="text-[#D1D6DB]">계좌 미입력</span>
                        )}
                      </p>
                      {employee.account_number && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(
                              employee.account_number!,
                            );
                            toast.success("계좌번호를 복사했어요");
                          }}
                          className="text-[11px] font-bold text-[#3182F6] bg-[#E8F3FF] hover:bg-[#D0E5FF] px-2 py-0.5 rounded-md transition-colors"
                        >
                          복사
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#8B95A1]" />
                      {employee.health_cert_date ? (
                        <p
                          className={`text-[13px] font-bold ${
                            isHealthCertExpired
                              ? "text-[#D9480F]"
                              : "text-[#3182F6]"
                          }`}
                        >
                          ~{employee.health_cert_date.substring(2)}{" "}
                          {isHealthCertExpired
                            ? "(만료)"
                            : employee.health_cert_verified
                              ? "(확인완료)"
                              : ""}
                        </p>
                      ) : (
                        <p className="text-[13px] font-medium text-[#D1D6DB]">
                          보건증 미입력
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 서류 뱃지 영역 */}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {[
                      {
                        label: "계약서",
                        url: employee.employment_contract_url,
                      },
                      { label: "보건증", url: employee.health_cert_url },
                    ].map((doc) =>
                      doc.url ? (
                        <button
                          key={doc.label}
                          onClick={() => handleViewDocument(doc.url!)}
                          className="flex items-center gap-1.5 px-2 py-1 bg-[#E8F3FF] text-[#3182F6] hover:bg-[#D0E5FF] rounded-lg text-[11px] font-bold transition-colors"
                        >
                          <FileCheck className="w-3.5 h-3.5" /> {doc.label}
                        </button>
                      ) : null,
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t border-slate-100 sm:border-0 shrink-0">
                <button
                  onClick={() => openEditModal(employee)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 bg-[#F9FAFB] hover:bg-[#F2F4F6] border border-slate-200 text-[#4E5968] rounded-xl text-[13px] font-bold transition-colors"
                >
                  <Edit2 className="w-4 h-4 text-[#8B95A1]" />
                  <span>수정하기</span>
                </button>
                <div className="relative flex-1 sm:flex-none">
                  <button className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 bg-[#F9FAFB] hover:bg-[#F2F4F6] border border-slate-200 text-[#4E5968] rounded-xl text-[13px] font-bold transition-colors">
                    <Palette className="w-4 h-4 text-[#8B95A1]" />
                    <span>색상</span>
                  </button>
                  <input
                    type="color"
                    value={employee.color_hex || "#8B95A1"}
                    onChange={(e) =>
                      handleColorChange(employee.id, e.target.value)
                    }
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                {!isAdmin && (
                  <button
                    onClick={() =>
                      handleDeleteEmployee(employee.id, employee.name)
                    }
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 bg-[#FFF4E6] hover:bg-[#FFE8CC] text-[#D9480F] rounded-xl text-[13px] font-bold transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>삭제</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 직원 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title={`${deleteConfirm?.name}님을 삭제할까요?`}
        description="출퇴근 기록까지 모두 영구 삭제되며 되돌릴 수 없어요."
        confirmLabel="삭제할게요"
        cancelLabel="취소"
        variant="destructive"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* 서류 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        isOpen={!!fileDeleteConfirm}
        title="첨부 서류를 삭제할까요?"
        description="삭제하면 되돌릴 수 없어요."
        confirmLabel="삭제할게요"
        cancelLabel="취소"
        variant="destructive"
        onConfirm={confirmFileDelete}
        onCancel={() => setFileDeleteConfirm(null)}
      />

      {/* 상세 정보 및 서류 관리 모달 */}
      {editingEmployee && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-5">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setEditingEmployee(null)}
          />

          <div className="relative w-full max-w-lg bg-white rounded-[28px] p-5 sm:p-7 pt-0 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-white z-10 pt-4 border-b border-slate-50 pb-4">
              <h2 className="text-[18px] font-bold text-[#191F28]">
                {editForm.name} 직원 정보
              </h2>
              <button
                onClick={() => setEditingEmployee(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6] text-[#8B95A1] hover:bg-[#E5E8EB] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-8">
              {/* 1. 기본 정보 */}
              <section className="space-y-4">
                <h3 className="text-[15px] font-bold text-[#191F28] flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#3182F6]" /> 기본 정보
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                      이름
                    </label>
                    <input
                      type="text"
                      value={editForm.name || ""}
                      onChange={(e) => handleFormChange("name", e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                      이메일 (계정)
                    </label>
                    <input
                      type="text"
                      value={editForm.email || ""}
                      disabled
                      className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-[14px] text-[#8B95A1] cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                      연락처
                    </label>
                    <input
                      type="tel"
                      value={editForm.phone || ""}
                      onChange={(e) =>
                        handleFormChange("phone", e.target.value)
                      }
                      className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                    />
                  </div>
                </div>
              </section>

              {/* 2. 근무 정보 */}
              <section className="space-y-4">
                <h3 className="text-[15px] font-bold text-[#191F28] flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[#3182F6]" /> 근무 정보
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                      소속 부서/매장
                    </label>
                    <input
                      type="text"
                      value={editForm.department || ""}
                      onChange={(e) =>
                        handleFormChange("department", e.target.value)
                      }
                      className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                      직급 (알바/매니저 등)
                    </label>
                    <input
                      type="text"
                      value={editForm.position || ""}
                      onChange={(e) =>
                        handleFormChange("position", e.target.value)
                      }
                      className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                      입사일
                    </label>
                    <input
                      type="date"
                      value={editForm.join_date || ""}
                      onChange={(e) =>
                        handleFormChange("join_date", e.target.value)
                      }
                      className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                    />
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-3 mt-1">
                    <div>
                      <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                        기본 출근 시간
                      </label>
                      <input
                        type="time"
                        value={editForm.target_in_time || ""}
                        onChange={(e) =>
                          handleFormChange("target_in_time", e.target.value)
                        }
                        className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                        기본 퇴근 시간
                      </label>
                      <input
                        type="time"
                        value={editForm.target_out_time || ""}
                        onChange={(e) =>
                          handleFormChange("target_out_time", e.target.value)
                        }
                        className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* 고용 형태 */}
                <div>
                  <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">
                    고용 형태
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          handleFormChange("employment_type", opt.value)
                        }
                        className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                          editForm.employment_type === opt.value
                            ? "bg-[#3182F6] text-white"
                            : "bg-[#F2F4F6] text-[#4E5968]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 근무 가능 장소 */}
                <div>
                  <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">
                    <MapPin className="w-3 h-3 inline mr-1" />
                    근무 가능 장소
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {WORK_LOCATION_OPTIONS.map((opt) => {
                      const selected = (editForm.work_locations || []).includes(
                        opt.value,
                      );
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            const cur = editForm.work_locations || [];
                            const next = selected
                              ? cur.filter((v) => v !== opt.value)
                              : [...cur, opt.value];
                            handleFormChange("work_locations", next);
                            if (!next.includes("cafe")) {
                              handleFormChange("cafe_positions", []);
                            }
                          }}
                          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                            selected
                              ? "bg-[#3182F6] text-white"
                              : "bg-[#F2F4F6] text-[#4E5968]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 카페 포지션 (카페 선택 시만 표시) */}
                {(editForm.work_locations || []).includes("cafe") && (
                  <div>
                    <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">
                      카페 담당 포지션
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {CAFE_POSITION_OPTIONS.map((opt) => {
                        const selected = (
                          editForm.cafe_positions || []
                        ).includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              const cur = editForm.cafe_positions || [];
                              const next = selected
                                ? cur.filter((v) => v !== opt.value)
                                : [...cur, opt.value];
                              handleFormChange("cafe_positions", next);
                            }}
                            className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                              selected
                                ? "bg-[#E8F3FF] text-[#3182F6] border border-[#3182F6]"
                                : "bg-[#F2F4F6] text-[#4E5968]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 시급 및 보험 유형 (알바만 표시) */}
                {(editForm.employment_type === "part_time_fixed" ||
                  editForm.employment_type === "part_time_daily") && (
                  <>
                    <div>
                      <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                        시급 (원)
                      </label>
                      <input
                        type="number"
                        value={editForm.hourly_wage ?? ""}
                        onChange={(e) =>
                          handleFormChange(
                            "hourly_wage",
                            e.target.value ? parseInt(e.target.value) : null,
                          )
                        }
                        placeholder="예: 9860"
                        className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">
                        보험 유형
                      </label>
                      <div className="flex gap-3">
                        {[
                          { value: "national", label: "2대보험" },
                          { value: "3.3", label: "3.3% 원천징수" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              handleFormChange("insurance_type", opt.value)
                            }
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all border ${
                              editForm.insurance_type === opt.value
                                ? "bg-[#E8F3FF] text-[#3182F6] border-[#3182F6]"
                                : "bg-[#F2F4F6] text-[#4E5968] border-transparent"
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${editForm.insurance_type === opt.value ? "border-[#3182F6]" : "border-[#8B95A1]"}`}
                            >
                              {editForm.insurance_type === opt.value && (
                                <span className="w-2 h-2 bg-[#3182F6] rounded-full" />
                              )}
                            </span>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>

              {/* 3. 급여 및 보건 */}
              <section className="space-y-4">
                <h3 className="text-[15px] font-bold text-[#191F28] flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#3182F6]" /> 급여 및 보건
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                      은행명
                    </label>
                    <input
                      type="text"
                      value={editForm.bank_name || ""}
                      onChange={(e) =>
                        handleFormChange("bank_name", e.target.value)
                      }
                      className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                      placeholder="예: 국민은행"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                      계좌번호
                    </label>
                    <input
                      type="text"
                      value={editForm.account_number || ""}
                      onChange={(e) =>
                        handleFormChange("account_number", e.target.value)
                      }
                      className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                      보건증 만료일
                    </label>
                    <input
                      type="date"
                      value={editForm.health_cert_date || ""}
                      onChange={(e) =>
                        handleFormChange("health_cert_date", e.target.value)
                      }
                      className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
                    />
                  </div>
                  <div className="flex items-center mt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.health_cert_verified || false}
                        onChange={(e) =>
                          handleFormChange(
                            "health_cert_verified",
                            e.target.checked,
                          )
                        }
                        className="w-4 h-4 rounded text-[#3182F6] focus:ring-[#3182F6] cursor-pointer"
                      />
                      <span className="text-[13px] font-medium text-[#4E5968]">
                        실물/서류 확인 완료
                      </span>
                    </label>
                  </div>
                </div>
              </section>

              {/* 4. 증빙 서류 업로드 (안전한 열람 버튼 적용) */}
              <section className="space-y-3">
                <h3 className="text-[15px] font-bold text-[#191F28] flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-[#3182F6]" /> 증빙 서류
                    관리
                  </span>
                  {uploading && (
                    <span className="text-[11px] text-[#3182F6] animate-pulse">
                      업로드 중...
                    </span>
                  )}
                </h3>

                <div className="space-y-2">
                  {[
                    {
                      label: "근로계약서",
                      key: "employment_contract_url" as const,
                      url: editForm.employment_contract_url,
                    },
                    {
                      label: "보건증 사본",
                      key: "health_cert_url" as const,
                      url: editForm.health_cert_url,
                    },
                  ].map((doc) => (
                    <div
                      key={doc.key}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100"
                    >
                      <span className="text-[13px] font-semibold text-[#4E5968]">
                        {doc.label}
                      </span>

                      {doc.url ? (
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button
                            onClick={() => handleViewDocument(doc.url!)}
                            className="px-3 py-1.5 bg-white border border-slate-200 text-[#3182F6] rounded-lg text-[12px] font-bold hover:bg-slate-50 transition-colors"
                          >
                            보기
                          </button>
                          <button
                            onClick={() => handleFileDelete(doc.key)}
                            className="p-1.5 text-[#8B95A1] hover:text-[#D9480F] hover:bg-[#FFF4E6] rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB] rounded-lg text-[12px] font-bold transition-colors">
                            <UploadCloud className="w-3.5 h-3.5" /> 업로드
                          </button>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => handleFileUpload(e, doc.key)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            disabled={uploading}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* 5. 기본 근무 패턴 */}
              <section className="space-y-3">
                <h3 className="text-[15px] font-bold text-[#191F28] flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[#3182F6]" /> 기본 근무
                  패턴
                </h3>
                {workDefaultsLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="cat-spinner" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {DAY_LABELS.map((label, dow) => {
                      const existing = workDefaults.filter(
                        (d) => d.day_of_week === dow,
                      );
                      return (
                        <div key={dow} className="flex items-start gap-3">
                          <span className="w-6 text-[13px] font-bold text-[#8B95A1] pt-2 shrink-0">
                            {label}
                          </span>
                          <div className="flex-1 space-y-1">
                            {existing.map((wd) => (
                              <div
                                key={wd.id}
                                className="flex items-center gap-2 bg-[#F2F4F6] rounded-xl px-3 py-2"
                              >
                                <span className="text-[12px] font-bold text-[#3182F6] bg-[#E8F3FF] px-2 py-0.5 rounded-md">
                                  {wd.work_location === "cafe"
                                    ? "카페"
                                    : wd.work_location === "factory"
                                      ? "공장"
                                      : "케이터링"}
                                </span>
                                <span className="text-[12px] text-[#4E5968] font-medium flex-1">
                                  {wd.start_time.slice(0, 5)} ~{" "}
                                  {wd.end_time.slice(0, 5)}
                                </span>
                                <button
                                  onClick={() =>
                                    setEditingDefault({
                                      ...wd,
                                      day_of_week: dow,
                                    })
                                  }
                                  className="text-[11px] text-[#3182F6] font-bold px-2 py-1 hover:bg-[#E8F3FF] rounded-lg"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => handleDeleteWorkDefault(wd.id)}
                                  className="text-[11px] text-[#D9480F] font-bold px-2 py-1 hover:bg-[#FFF4E6] rounded-lg"
                                >
                                  삭제
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() =>
                                setEditingDefault({
                                  day_of_week: dow,
                                  start_time: "09:00",
                                  end_time: "18:00",
                                  work_location: "cafe",
                                  cafe_positions: [],
                                })
                              }
                              className="text-[12px] text-[#8B95A1] hover:text-[#3182F6] font-bold px-3 py-1.5 hover:bg-[#F2F4F6] rounded-xl transition-all"
                            >
                              + 추가
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <button
              onClick={handleSaveEdit}
              className="w-full mt-8 py-4 bg-[#3182F6] text-white rounded-xl text-[16px] font-bold hover:bg-[#1B64DA] active:scale-[0.98] transition-all shadow-md shadow-blue-500/20"
            >
              정보 저장하기
            </button>
          </div>
        </div>
      )}

      {/* 기본 근무 패턴 편집 바텀시트 */}
      {editingDefault && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setEditingDefault(null)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-[28px] px-5 pt-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-250">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-9 h-1 bg-[#D1D6DB] rounded-full" />
            <h3 className="text-[18px] font-bold text-[#191F28] mb-6">
              {DAY_LABELS[editingDefault.day_of_week]}요일 근무 패턴{" "}
              {editingDefault.id ? "수정" : "추가"}
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                    시작 시간
                  </label>
                  <select
                    value={editingDefault.start_time || "09:00"}
                    onChange={(e) =>
                      setEditingDefault((prev) =>
                        prev ? { ...prev, start_time: e.target.value } : null,
                      )
                    }
                    className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
                  >
                    {generateTimeOptions(7, 21).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                    종료 시간
                  </label>
                  <select
                    value={editingDefault.end_time || "18:00"}
                    onChange={(e) =>
                      setEditingDefault((prev) =>
                        prev ? { ...prev, end_time: e.target.value } : null,
                      )
                    }
                    className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
                  >
                    {generateTimeOptions(7, 22).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">
                  근무 장소
                </label>
                <div className="flex gap-2">
                  {WORK_LOCATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setEditingDefault((prev) =>
                          prev
                            ? {
                                ...prev,
                                work_location: opt.value,
                                cafe_positions:
                                  opt.value !== "cafe"
                                    ? []
                                    : prev.cafe_positions,
                              }
                            : null,
                        )
                      }
                      className={`flex-1 py-2 rounded-xl text-[13px] font-bold transition-all ${editingDefault.work_location === opt.value ? "bg-[#3182F6] text-white" : "bg-[#F2F4F6] text-[#4E5968]"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {editingDefault.work_location === "cafe" && (
                <div>
                  <label className="block text-[12px] font-medium text-[#8B95A1] mb-2">
                    카페 포지션
                  </label>
                  <div className="flex gap-2">
                    {CAFE_POSITION_OPTIONS.map((opt) => {
                      const sel = (
                        editingDefault.cafe_positions || []
                      ).includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            const cur = editingDefault.cafe_positions || [];
                            setEditingDefault((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    cafe_positions: sel
                                      ? cur.filter((v) => v !== opt.value)
                                      : [...cur, opt.value],
                                  }
                                : null,
                            );
                          }}
                          className={`flex-1 py-2 rounded-xl text-[13px] font-bold transition-all ${sel ? "bg-[#E8F3FF] text-[#3182F6] border border-[#3182F6]" : "bg-[#F2F4F6] text-[#4E5968]"}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2.5 mt-6">
              <button
                onClick={handleSaveWorkDefault}
                disabled={savingDefault}
                className="w-full h-14 bg-[#3182F6] text-white rounded-2xl font-bold text-[16px] disabled:opacity-50"
              >
                {savingDefault ? "저장 중..." : "저장하기"}
              </button>
              <button
                onClick={() => setEditingDefault(null)}
                className="w-full h-14 bg-[#F2F4F6] text-[#4E5968] rounded-2xl font-bold text-[16px]"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
