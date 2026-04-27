import re

with open('d:/TFS/frontend/src/app/pages/TeamManagement.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Imports
text = text.replace(
    'import { fetchTeamMembers, apiInviteMember, apiUpdateMember, apiDeleteMember } from "../api/team";',
    'import { fetchTeamMembers, apiInviteMember, apiUpdateMember, apiDeleteMember, fetchTeamSettings, updateTeamSettings } from "../api/team";\nimport { Switch } from "../components/ui/switch";'
)

text = text.replace(
    'import { UserPlus, Trash2, Edit, Eye, Search, MoreVertical, Loader2, Lock } from "lucide-react";',
    'import { UserPlus, Trash2, Edit, Eye, Search, MoreVertical, Loader2, Lock, Settings } from "lucide-react";'
)

# 2. State
state_injection = """  const [roleSelection, setRoleSelection] = useState<"admin" | "user">("user");
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [teamSettings, setTeamSettings] = useState<any>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);"""
text = text.replace('  const [roleSelection, setRoleSelection] = useState<"admin" | "user">("user");\n  const [isActionLoading, setIsActionLoading] = useState(false);', state_injection)

# 3. useEffect addition for settings
effect_injection = """      }
      setIsLoading(false);
      
      if (user?.role === "admin") {
        setIsLoadingSettings(true);
        const setRes = await fetchTeamSettings();
        if (setRes.data) {
          setTeamSettings(setRes.data);
        }
        setIsLoadingSettings(false);
      }
    };"""
text = text.replace('      }\n      setIsLoading(false);\n    };', effect_injection)

# 4. Settings toggle handler
handler_injection = """
  const handleSettingChange = async (field: string, newValue: boolean) => {
    const prev = { ...teamSettings };
    setTeamSettings((p: any) => ({ ...p, [field]: newValue }));
    
    const res = await updateTeamSettings({ [field]: newValue });
    if (res.error) {
        toast.error(res.error);
        setTeamSettings(prev);
    }
  };

  const filteredMembers = members.filter((member) =>"""
text = text.replace('  const filteredMembers = members.filter((member) =>', handler_injection)

# 5. JSX Settings Panel Injection
settings_jsx = """
      {/* Settings Panel */}
      {user?.role === "admin" && (
        <section className="p-5 rounded-xl mb-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 mb-4">
                <Settings size={20} style={{ color: "#0B7FFF" }} />
                <h2 className="text-white font-semibold text-lg">Team Settings</h2>
            </div>
            
            {isLoadingSettings ? (
                <div className="flex justify-center py-4"><Loader2 size={24} className="animate-spin text-[#0B7FFF]" /></div>
            ) : teamSettings ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                        <div>
                            <p className="text-white font-medium">Member Directory</p>
                            <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Allow regular users to see the team list</p>
                        </div>
                        <Switch checked={teamSettings.allowMemberDirectory} onCheckedChange={(v) => handleSettingChange('allowMemberDirectory', v)} />
                    </div>
                    <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                        <div>
                            <p className="text-white font-medium">Member Invitations</p>
                            <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Allow regular users to invite new members</p>
                        </div>
                        <Switch checked={teamSettings.allowMemberInvite} onCheckedChange={(v) => handleSettingChange('allowMemberInvite', v)} />
                    </div>
                    <div className="flex items-center justify-between py-3">
                        <div>
                            <p className="text-white font-medium">External File Sharing</p>
                            <p style={{ color: "#6b7fa8", fontSize: "13px" }}>Allow files to be shared with users outside the team</p>
                        </div>
                        <Switch checked={teamSettings.allowExternalSharing} onCheckedChange={(v) => handleSettingChange('allowExternalSharing', v)} />
                    </div>
                </div>
            ) : (
                <p className="text-sm text-red-400">Failed to load settings.</p>
            )}
        </section>
      )}

      {/* Stats Cards */}"""

text = text.replace('{/* Stats Cards */}', settings_jsx)

# Clean up duplicate `user` cases in getRoleColor
text = text.replace('      case "user":\n        return "#00E5A0";\n      case "user":\n        return "#6b7fa8";', '      case "user":\n        return "#00E5A0";')


with open('d:/TFS/frontend/src/app/pages/TeamManagement.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("done jsx injection")
