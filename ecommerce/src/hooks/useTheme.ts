// Convenience accessor for the active branch's theme tokens.
import { useBranch } from "@/components/BranchProvider";

export function useTheme() {
	return useBranch().profile.theme;
}
