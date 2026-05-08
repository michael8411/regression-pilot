// Thin re-export — all logic lives in SessionContext so every caller shares
// one instance of the session state rather than creating independent copies.
export { useSessionContext as useSession } from "@/contexts/SessionContext";
