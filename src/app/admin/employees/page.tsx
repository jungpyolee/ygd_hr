"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

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
}

// 파일 업로드용 키 타입
type DocKey =
  | "employment_contract_url"
  | "bank_account_copy_url"
  | "resident_register_url"
  | "health_cert_url";

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const supabase = createClient();

  const [editingEmployee, setEditingEmployee] = useState<Profile | null>(null);

  // 항목이 많으므로 객체 하나로 묶어서 폼 상태 관리
  const [editForm, setEditForm] = useState<Partial<Profile>>({});

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error && data) setEmployees(data);
    setLoading(false);
  };

  const handleColorChange = async (id: string, newColor: string) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, color_hex: newColor } : emp))
    );
    await supabase
      .from("profiles")
      .update({ color_hex: newColor })
      .eq("id", id);
  };

  const handleDeleteEmployee = async (id: string, name: string) => {
    const isConfirmed = window.confirm(
      `정말 [${name}] 직원을 삭제하시겠어요?\n출퇴근 기록까지 모두 영구 삭제되며 복구할 수 없습니다.`
    );
    if (!isConfirmed) return;
    const { error } = await supabase.rpc("delete_user_admin", {
      target_user_id: id,
    });
    if (!error) {
      toast.success(`${name} 직원이 완전히 삭제되었습니다.`);
      setEmployees((prev) => prev.filter((emp) => emp.id !== id));
    } else {
      toast.error("삭제 중 오류가 발생했습니다.");
    }
  };

  const openEditModal = (employee: Profile) => {
    setEditingEmployee(employee);
    setEditForm({ ...employee });
  };

  const handleFormChange = (field: keyof Profile, value: any) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async () => {
    if (!editingEmployee || !editForm.name?.trim())
      return toast.error("이름을 입력해주세요.");

    // DB 업데이트
    const { error } = await supabase
      .from("profiles")
      .update(editForm)
      .eq("id", editingEmployee.id);

    if (error) return toast.error("정보 수정에 실패했습니다.");

    // 즉시 반영
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === editingEmployee.id
          ? ({ ...emp, ...editForm } as Profile)
          : emp
      )
    );
    toast.success("정보가 성공적으로 수정되었습니다.");
    setEditingEmployee(null);
  };

  // 🚀 프라이빗 파일 업로드 핸들러 (hr-documents 버킷 사용, '경로'만 저장)
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    column: DocKey
  ) => {
    if (!editingEmployee || !e.target.files || e.target.files.length === 0)
      return;
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
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === editingEmployee.id ? { ...emp, [column]: filePath } : emp
        )
      );

      toast.success("서류가 성공적으로 업로드되었습니다.");
    } catch (err) {
      console.error(err);
      toast.error("파일 업로드에 실패했습니다.");
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
  const handleFileDelete = async (column: DocKey) => {
    if (!editingEmployee) return;
    if (!window.confirm("첨부된 서류를 삭제하시겠습니까?")) return;

    await supabase
      .from("profiles")
      .update({ [column]: null })
      .eq("id", editingEmployee.id);
    setEditingEmployee({ ...editingEmployee, [column]: null });
    setEditForm((prev) => ({ ...prev, [column]: null }));
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === editingEmployee.id ? { ...emp, [column]: null } : emp
      )
    );
    toast.success("서류가 삭제되었습니다.");
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-[#3182F6] border-t-transparent rounded-full animate-spin" />
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
                    {employee.name.charAt(0)}
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

                  {/* 🚀 서류 뱃지 영역 (안전한 열람 버튼으로 교체됨) */}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {[
                      {
                        label: "계약서",
                        url: employee.employment_contract_url,
                      },
                      { label: "통장", url: employee.bank_account_copy_url },
                      { label: "등본", url: employee.resident_register_url },
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
                      ) : null
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
                  <span>관리</span>
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

      {/* 🚀 상세 정보 및 서류 관리 모달 */}
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
                            e.target.checked
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
                      label: "통장사본",
                      key: "bank_account_copy_url" as const,
                      url: editForm.bank_account_copy_url,
                    },
                    {
                      label: "주민등록등본",
                      key: "resident_register_url" as const,
                      url: editForm.resident_register_url,
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
    </div>
  );
}
