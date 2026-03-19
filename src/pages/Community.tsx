import { useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  UserPlus,
  Check,
  X,
  Clock,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  useFriendsList,
  usePendingRequests,
  useSentRequests,
  useSearchAthletes,
  useSendFriendRequest,
  useRespondToRequest,
} from "@/hooks/useFriends";
import { MergedFeed } from "@/components/community/MergedFeed";
import { WorkoutInvites } from "@/components/community/WorkoutInvites";

export default function Community() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: friends = [], isLoading: friendsLoading } = useFriendsList();
  const { data: pendingRequests = [] } = usePendingRequests();
  const { data: sentRequests = [] } = useSentRequests();
  const search = useSearchAthletes();
  const sendRequest = useSendFriendRequest();
  const respond = useRespondToRequest();

  const handleSearch = () => {
    if (searchQuery.trim().length >= 2) {
      search.mutate(searchQuery.trim());
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="page-title">Community</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            See what your friends are up to and run together.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Combined activity feed */}
          <div className="glass-card p-6 min-h-[400px] flex flex-col overflow-hidden lg:col-span-2">
            <h2 className="text-sm font-semibold text-foreground mb-1">Activity</h2>
            <p className="text-xs text-muted-foreground mb-4">Your runs and friends — newest first</p>
            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
              <MergedFeed friends={friends} />
            </div>
          </div>

          {/* Invites + Friends (stacked) */}
          <div className="flex flex-col gap-6">
            {/* Invites */}
            <div className="glass-card p-6 min-h-[320px] flex flex-col overflow-hidden">
              <h2 className="text-sm font-semibold text-foreground mb-4">Invites</h2>
              <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
                <WorkoutInvites friends={friends} />
              </div>
            </div>

            {/* Friends */}
            <div className="glass-card p-6 min-h-[320px] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  Friends
                  {pendingRequests.length > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground inline-flex items-center justify-center">
                      {pendingRequests.length}
                    </span>
                  )}
                </h2>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-4">
              {/* Search */}
              <div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search athletes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleSearch}
                    disabled={searchQuery.trim().length < 2 || search.isPending}
                    size="sm"
                    className="h-9"
                  >
                    {search.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Search"
                    )}
                  </Button>
                </div>

                {search.data && search.data.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {search.data.map((result) => (
                      <div
                        key={result.id}
                        className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/30"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                            {result.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-sm font-medium">{result.name}</span>
                            {"username" in result && result.username && (
                              <span className="text-xs text-muted-foreground ml-1.5">@{result.username}</span>
                            )}
                          </div>
                        </div>
                        {result.is_friend ? (
                          <span className="text-xs text-muted-foreground font-medium">Already friends</span>
                        ) : result.is_pending ? (
                          <span className="text-xs text-muted-foreground font-medium">Request sent</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              sendRequest.mutate(result.id, {
                                onSuccess: () => {
                                  toast.success(`Request sent to ${result.name}`);
                                  search.reset();
                                  setSearchQuery("");
                                },
                                onError: (e) => toast.error(e.message),
                              });
                            }}
                            disabled={sendRequest.isPending}
                          >
                            <UserPlus className="w-3.5 h-3.5 mr-1" />
                            Add
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {search.data && search.data.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-3">No athletes found</p>
                )}
              </div>

              {/* Pending Requests */}
              {pendingRequests.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Pending Requests
                  </h3>
                  <div className="space-y-2">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/30"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-sm font-semibold">
                            {req.fromName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{req.fromName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 w-8 p-0"
                            onClick={() =>
                              respond.mutate(
                                { requestId: req.id, action: "accept" },
                                {
                                  onSuccess: () => toast.success(`You and ${req.fromName} are now friends`),
                                }
                              )
                            }
                            disabled={respond.isPending}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            onClick={() =>
                              respond.mutate(
                                { requestId: req.id, action: "reject" },
                                {
                                  onSuccess: () => toast("Request declined"),
                                }
                              )
                            }
                            disabled={respond.isPending}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sent Requests */}
              {sentRequests.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Sent Requests
                  </h3>
                  <div className="space-y-2">
                    {sentRequests.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/30 opacity-70"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-semibold">
                            {req.toName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{req.toName}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Pending
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Friends List */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Friends{friends.length > 0 ? ` (${friends.length})` : ""}
                </h3>
                {friendsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : friends.length === 0 ? (
                  <div className="text-center py-8">
                    <UserPlus className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No friends yet. Search above to connect.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {friends.map((friend) => (
                      <Link
                        key={friend.id}
                        to={`/community/profile/${friend.id}`}
                        className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-muted/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                            {friend.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{friend.name}</p>
                            {friend.goalDistance && (
                              <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                                {friend.goalDistance}
                                {friend.goalTime ? ` · ${friend.goalTime}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
