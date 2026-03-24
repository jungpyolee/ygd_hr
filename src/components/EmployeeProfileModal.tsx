"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import {
  X,
  Edit2,
  Phone,
  CreditCard,
  Calendar,
  Briefcase,
  Check,
} from "lucide-react";
import AvatarDisplay from "@/components/AvatarDisplay";

interface FullProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  department: string | null;
  position: string | null;
  role: string;
  join_date: string | null;
  employment_type: string | null;
  hourly_wage: number | null;
  bank_name: string | null;
  account_number: string | null;
  health_cert_date: string | null;
  health_cert_verified: boolean | null;
  color_hex: string;
  insurance_type: string | null;
  avatar_config?: any;
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: "정규직",
  part_time_fixed: "고정 알바",
  part_time_daily: "일일 알바",
};

interface Props {
  profileId: string;
  onClose: () => void;
}

export default function EmployeeProfileModal({ profileId, onClose }: Props) {
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<FullProfile>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select(
          "id, name, email, phone, department, position, role, join_date, employment_type, hourly_wage, bank_name, account_number, health_cert_date, health_cert_verified, color_hex, insurance_type, avatar_config",
        )
        .eq("id", profileId)
        .single();
      setProfile(data as FullProfile);
      setLoading(false);
    };
    load();
  }, [profileId]);

  const handleEdit = () => {
    setForm({ ...profile });
    setEditMode(true);
  };

  const handleCancel = () => {
    setEditMode(false);
    setForm({});
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        name: form.name,
        phone: form.phone || null,
        department: form.department || null,
        position: form.position || null,
        join_date: form.join_date || null,
        employment_type: form.employment_type || null,
        hourly_wage: form.hourly_wage ? Number(form.hourly_wage) : null,
        bank_name: form.bank_name || null,
        account_number: form.account_number || null,
        health_cert_date: form.health_cert_date || null,
        insurance_type: form.insurance_type || null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error("저장에 실패했어요", { description: "다시 시도해주세요." });
    } else {
      setProfile({ ...profile, ...form } as FullProfile);
      setEditMode(false);
      setForm({});
      toast.success("저장됐어요");
    }
  };

  const isHealthCertExpired =
    profile?.health_cert_date &&
    new Date(profile.health_cert_date) < new Date();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm bg-white rounded-[28px] shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto scrollbar-hide">
        {/* 헤더 */}
        <div className="flex justify-between items-center px-6 pt-5 pb-4 sticky top-0 bg-white z-10 border-b border-slate-50">
          <div className="flex items-center gap-1">
            {!editMode ? (
              <button
                onClick={handleEdit}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] text-[#8B95A1] transition-colors"
                title="수정하기"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-[12px] font-bold text-[#8B95A1] hover:bg-[#F2F4F6] rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 text-[12px] font-bold text-white bg-[#3182F6] hover:bg-[#1a6fe8] rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "저장하기"}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6] text-[#8B95A1] hover:bg-[#E5E8EB] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-6">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-16 h-16 rounded-full bg-[#F2F4F6] animate-pulse" />
              <div className="w-24 h-4 bg-[#F2F4F6] rounded-full animate-pulse" />
              <div className="w-16 h-3 bg-[#F2F4F6] rounded-full animate-pulse" />
            </div>
          ) : !profile ? (
            <p className="text-center text-[13px] text-[#8B95A1] py-10">
              정보를 불러올 수 없어요.
            </p>
          ) : editMode ? (
            <EditForm form={form} setForm={setForm} />
          ) : (
            <ViewBody profile={profile} isHealthCertExpired={!!isHealthCertExpired} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── 보기 모드 ──────────────────────────────────────────────
function ViewBody({
  profile,
  isHealthCertExpired,
}: {
  profile: FullProfile;
  isHealthCertExpired: boolean;
}) {
  return (
    <div className="space-y-5 pt-2">
      {/* 아바타 + 이름 */}
      <div className="flex flex-col items-center gap-2 py-2">
        <AvatarDisplay
          userId={profile.id}
          avatarConfig={profile.avatar_config}
          size={64}
        />
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-[18px] font-bold text-[#191F28]">{profile.name}</p>
            {profile.role === "admin" && (
              <span className="bg-[#E8F3FF] text-[#3182F6] text-[11px] font-bold px-1.5 py-0.5 rounded-md">
                관리자
              </span>
            )}
          </div>
          {(profile.department || profile.position) && (
            <p className="text-[13px] text-[#8B95A1] mt-0.5">
              {profile.department}
              {profile.department && profile.position ? " · " : ""}
              {profile.position}
            </p>
          )}
        </div>
      </div>

      {/* 정보 행들 */}
      <div className="space-y-0 divide-y divide-slate-50">
        <InfoRow
          icon={<Briefcase className="w-4 h-4" />}
          label="고용형태"
          value={
            profile.employment_type
              ? EMPLOYMENT_TYPE_LABELS[profile.employment_type] ?? profile.employment_type
              : null
          }
        />
        <InfoRow
          icon={<Calendar className="w-4 h-4" />}
          label="입사일"
          value={profile.join_date ? profile.join_date.replace(/-/g, ".") : null}
        />
        <InfoRow
          icon={<Phone className="w-4 h-4" />}
          label="연락처"
          value={profile.phone}
        />
        <InfoRow
          label="시급"
          value={
            profile.hourly_wage
              ? `${profile.hourly_wage.toLocaleString()}원`
              : null
          }
          sub={
            profile.insurance_type === "national"
              ? "4대보험"
              : profile.insurance_type === "3.3"
                ? "3.3%"
                : null
          }
        />
        <div className="flex items-start gap-3 py-3">
          <div className="w-4 h-4 mt-0.5 flex items-center justify-center text-[#8B95A1]">
            <CreditCard className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-[#8B95A1] mb-0.5">계좌</p>
            {profile.account_number ? (
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-[#191F28]">
                  {profile.bank_name ? `${profile.bank_name} ` : ""}
                  {profile.account_number}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(profile.account_number!);
                    toast.success("계좌번호를 복사했어요");
                  }}
                  className="text-[11px] font-bold text-[#3182F6] bg-[#E8F3FF] hover:bg-[#D0E5FF] px-2 py-0.5 rounded-md transition-colors shrink-0"
                >
                  복사
                </button>
              </div>
            ) : (
              <p className="text-[13px] text-[#D1D6DB]">미입력</p>
            )}
          </div>
        </div>
        <div className="flex items-start gap-3 py-3">
          <div className="w-4 h-4 mt-0.5 flex items-center justify-center text-[#8B95A1]">
            <Check className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-medium text-[#8B95A1] mb-0.5">보건증</p>
            {profile.health_cert_date ? (
              <p
                className={`text-[13px] font-bold ${isHealthCertExpired ? "text-[#D9480F]" : "text-[#3182F6]"}`}
              >
                ~{profile.health_cert_date.substring(2)}{" "}
                {isHealthCertExpired
                  ? "(만료)"
                  : profile.health_cert_verified
                    ? "(확인완료)"
                    : ""}
              </p>
            ) : (
              <p className="text-[13px] text-[#D1D6DB]">미입력</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
  sub?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      {icon ? (
        <div className="w-4 h-4 mt-0.5 text-[#8B95A1] shrink-0">{icon}</div>
      ) : (
        <div className="w-4 h-4 shrink-0" />
      )}
      <div className="flex-1">
        <p className="text-[11px] font-medium text-[#8B95A1] mb-0.5">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-[#191F28]">
            {value ?? <span className="text-[#D1D6DB]">미입력</span>}
          </p>
          {sub && (
            <span className="text-[11px] font-bold text-[#4E5968] bg-[#F2F4F6] px-1.5 py-0.5 rounded-md">
              {sub}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 수정 모드 ──────────────────────────────────────────────
function EditForm({
  form,
  setForm,
}: {
  form: Partial<FullProfile>;
  setForm: React.Dispatch<React.SetStateAction<Partial<FullProfile>>>;
}) {
  const set = (key: keyof FullProfile, value: string | number | null) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4 pt-2">
      <Field label="이름">
        <input
          value={form.name ?? ""}
          onChange={(e) => set("name", e.target.value)}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="부서">
          <input
            value={form.department ?? ""}
            onChange={(e) => set("department", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="직급">
          <input
            value={form.position ?? ""}
            onChange={(e) => set("position", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="고용형태">
        <select
          value={form.employment_type ?? ""}
          onChange={(e) => set("employment_type", e.target.value)}
          className={inputCls}
        >
          <option value="">선택 안 함</option>
          <option value="full_time">정규직</option>
          <option value="part_time_fixed">고정 알바</option>
          <option value="part_time_daily">일일 알바</option>
        </select>
      </Field>
      <Field label="입사일">
        <input
          type="date"
          value={form.join_date ?? ""}
          onChange={(e) => set("join_date", e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="연락처">
        <input
          type="tel"
          value={form.phone ?? ""}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="010-0000-0000"
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="시급 (원)">
          <input
            type="number"
            value={form.hourly_wage ?? ""}
            onChange={(e) =>
              set("hourly_wage", e.target.value ? Number(e.target.value) : null)
            }
            className={inputCls}
          />
        </Field>
        <Field label="보험형태">
          <select
            value={form.insurance_type ?? ""}
            onChange={(e) => set("insurance_type", e.target.value)}
            className={inputCls}
          >
            <option value="">선택 안 함</option>
            <option value="national">4대보험</option>
            <option value="3.3">3.3%</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="은행명">
          <input
            value={form.bank_name ?? ""}
            onChange={(e) => set("bank_name", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="계좌번호">
          <input
            value={form.account_number ?? ""}
            onChange={(e) => set("account_number", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="보건증 만료일">
        <input
          type="date"
          value={form.health_cert_date ?? ""}
          onChange={(e) => set("health_cert_date", e.target.value)}
          className={inputCls}
        />
      </Field>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[13px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[#8B95A1] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
