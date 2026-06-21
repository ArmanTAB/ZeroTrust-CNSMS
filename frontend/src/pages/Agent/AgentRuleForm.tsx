// src/pages/Agent/AgentRuleForm.tsx
import React, { useState, useEffect, ChangeEvent } from "react";
import MainLayout from "../../components/Layout/MainLayout";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  SelectChangeEvent,
  Switch,
  TextField,
  Typography,
  Alert,
  Divider,
} from "@mui/material";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../store/ToastContext";
import AgentApi from "../../api/agent.api";
import {
  AgentRule,
  AgentRuleType,
  AgentUser,
  AgentUserRole,
} from "../../types/agent";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import BlockIcon from "@mui/icons-material/Block";

// Define a properly typed empty rule
const emptyRule: Partial<AgentRule> = {
  name: "",
  description: "",
  type: AgentRuleType.BLOCK,
  resources: {
    websites: [],
    applications: [],
  },
  appliesTo: {
    users: [],
    departments: [],
    roles: [],
  },
  conditions: {
    timeRestrictions: {
      enabled: false,
      startTime: "09:00",
      endTime: "17:00",
      days: [1, 2, 3, 4, 5], // Monday to Friday
    },
  },
  priority: 10,
  isActive: true,
};

interface AgentRuleFormProps {
  viewOnly?: boolean;
}

const AgentRuleForm: React.FC<AgentRuleFormProps> = ({ viewOnly = false }) => {
  const { id, action } = useParams<{ id: string; action: string }>();
  const isNew = !id;
  const isView = viewOnly || action === "view";
  const [formData, setFormData] = useState<Partial<AgentRule>>(emptyRule);
  const [loading, setLoading] = useState<boolean>(!isNew);
  const [saving, setSaving] = useState<boolean>(false);
  const [users, setUsers] = useState<AgentUser[]>([]);
  const [blockAllWebsites, setBlockAllWebsites] = useState<boolean>(false);
  const [newItem, setNewItem] = useState<{ [key: string]: string }>({
    website: "",
    application: "",
  });
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Predefined departments and roles
  const departments = [
    "IT",
    "HR",
    "Finance",
    "Marketing",
    "Sales",
    "Support",
    "Management",
    "General",
  ];
  const roles = Object.values(AgentUserRole);
  const weekdays = [
    { value: 0, label: "Sunday" },
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
  ];

  const checkIfBlockAllRule = (rule: Partial<AgentRule>) => {
    if (
      rule.type === AgentRuleType.BLOCK &&
      rule.resources?.websites?.includes("*")
    ) {
      setBlockAllWebsites(true);
    }
  };

  const handleBlockAllToggle = (checked: boolean) => {
    setBlockAllWebsites(checked);

    if (checked) {
      setFormData((prev) => ({
        ...prev,
        type: AgentRuleType.BLOCK,
        name: prev.name || "Block All Websites",
        description:
          prev.description ||
          "Blocks all websites except those explicitly allowed by other rules",
        resources: {
          websites: ["*"],
          applications: prev.resources?.applications || [],
        },
        priority: 1,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        resources: {
          websites:
            prev.resources?.websites?.filter((site) => site !== "*") || [],
          applications: prev.resources?.applications || [],
        },
        priority: 10,
      }));
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const usersData = await AgentApi.getUsers();
        setUsers(usersData);

        if (!isNew) {
          const ruleData = await AgentApi.getRuleById(id || "");
          if (ruleData) {
            setFormData(ruleData);
            checkIfBlockAllRule(ruleData);
          } else {
            showToast("Rule not found", "error");
            navigate("/agent/rules");
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        showToast("Failed to load data", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, isNew, navigate, showToast]);

  const handleTextChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    // Handle priority as a number
    if (name === "priority") {
      setFormData((prev) => ({
        ...prev,
        priority: Number(value),
      }));
      return;
    }

    // Handle time fields
    if (name === "startTime" || name === "endTime") {
      setFormData((prev) => {
        const updatedData = { ...prev };
        if (!updatedData.conditions) {
          updatedData.conditions = {
            timeRestrictions: {
              enabled: false,
              startTime: name === "startTime" ? value : "09:00",
              endTime: name === "endTime" ? value : "17:00",
              days: [1, 2, 3, 4, 5],
            },
          };
        } else if (!updatedData.conditions.timeRestrictions) {
          updatedData.conditions.timeRestrictions = {
            enabled: false,
            startTime: name === "startTime" ? value : "09:00",
            endTime: name === "endTime" ? value : "17:00",
            days: [1, 2, 3, 4, 5],
          };
        } else {
          updatedData.conditions.timeRestrictions[
            name === "startTime" ? "startTime" : "endTime"
          ] = value;
        }
        return updatedData;
      });
      return;
    }

    // Handle simple string fields
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle switch changes (checkboxes)
  const handleSwitchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;

    if (name === "isActive") {
      setFormData((prev) => ({ ...prev, isActive: checked }));
      return;
    }

    if (name === "timeRestrictionsEnabled") {
      setFormData((prev) => {
        const updatedData = { ...prev };
        if (!updatedData.conditions) {
          updatedData.conditions = {
            timeRestrictions: {
              enabled: checked,
              startTime: "09:00",
              endTime: "17:00",
              days: [1, 2, 3, 4, 5],
            },
          };
        } else if (!updatedData.conditions.timeRestrictions) {
          updatedData.conditions.timeRestrictions = {
            enabled: checked,
            startTime: "09:00",
            endTime: "17:00",
            days: [1, 2, 3, 4, 5],
          };
        } else {
          updatedData.conditions.timeRestrictions.enabled = checked;
        }
        return updatedData;
      });
    }
  };

  // Handle select changes
  const handleSelectChange = (e: SelectChangeEvent<unknown>) => {
    const { name, value } = e.target;

    // Handle rule type
    if (name === "type") {
      const newType = value as AgentRuleType;
      setFormData((prev) => ({
        ...prev,
        type: newType,
      }));

      // If changing to ALLOW type, disable block all websites
      if (newType === AgentRuleType.ALLOW && blockAllWebsites) {
        setBlockAllWebsites(false);
        setFormData((prev) => ({
          ...prev,
          resources: {
            websites:
              prev.resources?.websites?.filter((site) => site !== "*") || [],
            applications: prev.resources?.applications || [],
          },
        }));
      }
      return;
    }

    // Handle days selection
    if (name === "days") {
      setFormData((prev) => {
        const updatedData = { ...prev };
        if (!updatedData.conditions) {
          updatedData.conditions = {
            timeRestrictions: {
              enabled: false,
              startTime: "09:00",
              endTime: "17:00",
              days: value as number[],
            },
          };
        } else if (!updatedData.conditions.timeRestrictions) {
          updatedData.conditions.timeRestrictions = {
            enabled: false,
            startTime: "09:00",
            endTime: "17:00",
            days: value as number[],
          };
        } else {
          updatedData.conditions.timeRestrictions.days = value as number[];
        }
        return updatedData;
      });
      return;
    }

    // Handle time fields
    if (name === "startTime" || name === "endTime") {
      setFormData((prev) => {
        const updatedData = { ...prev };
        if (!updatedData.conditions) {
          updatedData.conditions = {
            timeRestrictions: {
              enabled: false,
              startTime: name === "startTime" ? (value as string) : "09:00",
              endTime: name === "endTime" ? (value as string) : "17:00",
              days: [1, 2, 3, 4, 5],
            },
          };
        } else if (!updatedData.conditions.timeRestrictions) {
          updatedData.conditions.timeRestrictions = {
            enabled: false,
            startTime: name === "startTime" ? (value as string) : "09:00",
            endTime: name === "endTime" ? (value as string) : "17:00",
            days: [1, 2, 3, 4, 5],
          };
        } else {
          updatedData.conditions.timeRestrictions[
            name === "startTime" ? "startTime" : "endTime"
          ] = value as string;
        }
        return updatedData;
      });
      return;
    }

    // Handle nested properties for applies to
    if (name.startsWith("appliesTo.")) {
      const field = name.split(".")[1] as "users" | "departments" | "roles";
      setFormData((prev) => {
        const updatedData = { ...prev };
        if (!updatedData.appliesTo) {
          updatedData.appliesTo = { users: [], departments: [], roles: [] };
        }
        updatedData.appliesTo[field] = value as string[];
        return updatedData;
      });
    }
  };

  // Handle adding new resource items
  const handleNewItemChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    type: "website" | "application"
  ) => {
    setNewItem((prev) => ({ ...prev, [type]: e.target.value }));
  };

  const handleAddItem = (type: "websites" | "applications") => {
    const itemKey = type === "websites" ? "website" : "application";
    const itemValue = newItem[itemKey].trim();

    if (!itemValue) return;

    setFormData((prev) => {
      const updatedData = { ...prev };

      if (!updatedData.resources) {
        updatedData.resources = { websites: [], applications: [] };
      }

      const currentArray = updatedData.resources[type] || [];
      updatedData.resources[type] = [...currentArray, itemValue];

      return updatedData;
    });

    setNewItem((prev) => ({ ...prev, [itemKey]: "" }));
  };

  const handleRemoveItem = (
    type: "websites" | "applications",
    index: number
  ) => {
    setFormData((prev) => {
      const updatedData = { ...prev };

      if (!updatedData.resources) {
        return updatedData;
      }

      const currentArray = updatedData.resources[type] || [];
      updatedData.resources[type] = currentArray.filter((_, i) => i !== index);

      return updatedData;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isView) return;

    setSaving(true);
    try {
      let result;
      if (isNew) {
        result = await AgentApi.createRule(formData);
        if (result) {
          showToast("Rule created successfully", "success");
        }
      } else {
        result = await AgentApi.updateRule(id || "", formData);
        if (result) {
          showToast("Rule updated successfully", "success");
        }
      }

      navigate("/agent/rules");
    } catch (error) {
      console.error("Error saving rule:", error);
      showToast(`Failed to ${isNew ? "create" : "update"} rule`, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          height="64vh"
        >
          <CircularProgress />
        </Box>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Box display="flex" alignItems="center" mb={6}>
        <Button
          component={Link}
          to="/agent/rules"
          startIcon={<ArrowBackIcon />}
          sx={{ mr: 4 }}
        >
          Back to Rules
        </Button>
        <Typography variant="h4" fontWeight="bold" color="text.primary">
          {isView ? "View Rule" : isNew ? "Create New Rule" : "Edit Rule"}
        </Typography>
      </Box>

      <Paper sx={{ p: 6 }}>
        <form onSubmit={handleSubmit}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Block All Websites Toggle */}
            <Box>
              <Typography variant="h6" fontWeight="medium" mb={2}>
                Quick Setup
              </Typography>
              <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                  Use the toggle below to quickly create a rule that blocks all
                  websites. You can then create additional "Allow" rules to
                  permit specific websites for your workers.
                </Typography>
              </Alert>

              <FormControlLabel
                control={
                  <Switch
                    checked={blockAllWebsites}
                    onChange={(e) => handleBlockAllToggle(e.target.checked)}
                    disabled={isView}
                    color="error"
                  />
                }
                label={
                  <Box display="flex" alignItems="center" gap={1}>
                    <BlockIcon
                      color={blockAllWebsites ? "error" : "disabled"}
                    />
                    <Typography>
                      Block All Websites (except those explicitly allowed)
                    </Typography>
                  </Box>
                }
              />

              {blockAllWebsites && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>Warning:</strong> This will block access to all
                    websites. Make sure to create "Allow" rules for essential
                    websites that workers need access to.
                  </Typography>
                </Alert>
              )}
            </Box>

            <Divider />

            {/* Basic Information */}
            <Box>
              <Typography variant="h6" fontWeight="medium" mb={3}>
                Basic Information
              </Typography>

              <Box
                display="grid"
                gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }}
                gap={3}
              >
                <TextField
                  fullWidth
                  label="Rule Name"
                  name="name"
                  value={formData.name || ""}
                  onChange={handleTextChange}
                  required
                  disabled={isView}
                />

                <FormControl fullWidth disabled={isView}>
                  <InputLabel>Rule Type</InputLabel>
                  <Select
                    name="type"
                    value={formData.type || AgentRuleType.BLOCK}
                    onChange={handleSelectChange}
                    label="Rule Type"
                  >
                    <MenuItem value={AgentRuleType.ALLOW}>Allow</MenuItem>
                    <MenuItem value={AgentRuleType.BLOCK}>Block</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box mt={3}>
                <TextField
                  fullWidth
                  label="Description"
                  name="description"
                  value={formData.description || ""}
                  onChange={handleTextChange}
                  multiline
                  rows={2}
                  disabled={isView}
                />
              </Box>
            </Box>

            {/* Resources */}
            <Box mt={3} pt={3} borderTop="1px solid" borderColor="divider">
              <Typography variant="h6" fontWeight="medium" mb={1}>
                Resources
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Specify the resources this rule applies to (websites,
                applications)
              </Typography>

              {/* Websites */}
              <Box mb={3}>
                <Typography variant="subtitle1" fontWeight="medium" mb={2}>
                  Websites
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1} mb={3}>
                  {formData.resources?.websites?.map((website, index) => (
                    <Chip
                      key={index}
                      label={website === "*" ? "All Websites (*)" : website}
                      onDelete={
                        isView
                          ? undefined
                          : () => handleRemoveItem("websites", index)
                      }
                      color={website === "*" ? "error" : "primary"}
                      variant={website === "*" ? "filled" : "outlined"}
                    />
                  ))}
                  {!formData.resources?.websites?.length && (
                    <Typography variant="body2" color="text.secondary">
                      No websites added yet
                    </Typography>
                  )}
                </Box>

                {!isView && !blockAllWebsites && (
                  <Box display="flex" gap={2} mb={3}>
                    <TextField
                      size="small"
                      label="Add Website"
                      placeholder="example.com"
                      value={newItem.website}
                      onChange={(e) => handleNewItemChange(e, "website")}
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      variant="outlined"
                      onClick={() => handleAddItem("websites")}
                      disabled={!newItem.website.trim()}
                    >
                      Add
                    </Button>
                  </Box>
                )}

                {blockAllWebsites && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      While "Block All Websites" is enabled, you cannot add
                      individual websites to this rule. Create separate "Allow"
                      rules for specific websites that should be accessible.
                    </Typography>
                  </Alert>
                )}
              </Box>

              {/* Applications */}
              <Box mb={3}>
                <Typography variant="subtitle1" fontWeight="medium" mb={2}>
                  Applications
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1} mb={3}>
                  {formData.resources?.applications?.map((app, index) => (
                    <Chip
                      key={index}
                      label={app}
                      onDelete={
                        isView
                          ? undefined
                          : () => handleRemoveItem("applications", index)
                      }
                      color="secondary"
                      variant="outlined"
                    />
                  ))}
                  {!formData.resources?.applications?.length && (
                    <Typography variant="body2" color="text.secondary">
                      No applications added yet
                    </Typography>
                  )}
                </Box>

                {!isView && (
                  <Box display="flex" gap={2} mb={3}>
                    <TextField
                      size="small"
                      label="Add Application"
                      placeholder="chrome.exe"
                      value={newItem.application}
                      onChange={(e) => handleNewItemChange(e, "application")}
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      variant="outlined"
                      onClick={() => handleAddItem("applications")}
                      disabled={!newItem.application.trim()}
                    >
                      Add
                    </Button>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Rule Applies To */}
            <Box mt={3} pt={3} borderTop="1px solid" borderColor="divider">
              <Typography variant="h6" fontWeight="medium" mb={1}>
                Rule Applies To
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Specify which users, departments, or roles this rule applies to
              </Typography>

              <Box mb={3}>
                <FormControl fullWidth disabled={isView} sx={{ mb: 3 }}>
                  <InputLabel>Users</InputLabel>
                  <Select
                    multiple
                    name="appliesTo.users"
                    value={formData.appliesTo?.users || []}
                    onChange={handleSelectChange}
                    input={<OutlinedInput label="Users" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {(selected as string[]).map((userId) => {
                          const user = users.find((u) => u._id === userId);
                          return (
                            <Chip
                              key={userId}
                              label={
                                user
                                  ? `${user.firstName} ${user.lastName}`
                                  : userId
                              }
                              size="small"
                            />
                          );
                        })}
                      </Box>
                    )}
                  >
                    {users.map((user) => (
                      <MenuItem key={user._id} value={user._id}>
                        <Checkbox
                          checked={
                            (formData.appliesTo?.users || []).indexOf(
                              user._id
                            ) > -1
                          }
                        />
                        <ListItemText
                          primary={`${user.firstName} ${user.lastName} (${user.email})`}
                        />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box
                display="grid"
                gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }}
                gap={3}
              >
                <FormControl fullWidth disabled={isView} sx={{ mb: 3 }}>
                  <InputLabel>Departments</InputLabel>
                  <Select
                    multiple
                    name="appliesTo.departments"
                    value={formData.appliesTo?.departments || []}
                    onChange={handleSelectChange}
                    input={<OutlinedInput label="Departments" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {(selected as string[]).map((dept) => (
                          <Chip key={dept} label={dept} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {departments.map((dept) => (
                      <MenuItem key={dept} value={dept}>
                        <Checkbox
                          checked={
                            (formData.appliesTo?.departments || []).indexOf(
                              dept
                            ) > -1
                          }
                        />
                        <ListItemText primary={dept} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth disabled={isView} sx={{ mb: 3 }}>
                  <InputLabel>Roles</InputLabel>
                  <Select
                    multiple
                    name="appliesTo.roles"
                    value={formData.appliesTo?.roles || []}
                    onChange={handleSelectChange}
                    input={<OutlinedInput label="Roles" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {(selected as string[]).map((role) => (
                          <Chip key={role} label={role} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {roles.map((role) => (
                      <MenuItem key={role} value={role}>
                        <Checkbox
                          checked={
                            (formData.appliesTo?.roles || []).indexOf(role) > -1
                          }
                        />
                        <ListItemText primary={role} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>

            {/* Time Restrictions */}
            <Box mt={3} pt={3} borderTop="1px solid" borderColor="divider">
              <Typography variant="h6" fontWeight="medium" mb={1}>
                Time Restrictions
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Optionally restrict when this rule is active
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={
                      formData.conditions?.timeRestrictions?.enabled || false
                    }
                    onChange={handleSwitchChange}
                    name="timeRestrictionsEnabled"
                    color="primary"
                    disabled={isView}
                  />
                }
                label="Enable time restrictions"
              />

              {formData.conditions?.timeRestrictions?.enabled && (
                <Box
                  mt={3}
                  display="grid"
                  gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }}
                  gap={3}
                >
                  <TextField
                    fullWidth
                    label="Start Time"
                    type="time"
                    name="startTime"
                    value={
                      formData.conditions?.timeRestrictions?.startTime ||
                      "09:00"
                    }
                    onChange={handleTextChange}
                    InputLabelProps={{ shrink: true }}
                    disabled={isView}
                  />

                  <TextField
                    fullWidth
                    label="End Time"
                    type="time"
                    name="endTime"
                    value={
                      formData.conditions?.timeRestrictions?.endTime || "17:00"
                    }
                    onChange={handleTextChange}
                    InputLabelProps={{ shrink: true }}
                    disabled={isView}
                  />

                  <Box gridColumn={{ xs: "1", md: "span 2" }}>
                    <FormControl fullWidth disabled={isView}>
                      <InputLabel>Days of Week</InputLabel>
                      <Select
                        multiple
                        name="days"
                        value={
                          formData.conditions?.timeRestrictions?.days || [
                            1, 2, 3, 4, 5,
                          ]
                        }
                        onChange={handleSelectChange}
                        input={<OutlinedInput label="Days of Week" />}
                        renderValue={(selected) => (
                          <Box
                            sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}
                          >
                            {(selected as number[]).map((day) => (
                              <Chip
                                key={day}
                                label={
                                  weekdays.find((d) => d.value === day)
                                    ?.label || day.toString()
                                }
                                size="small"
                              />
                            ))}
                          </Box>
                        )}
                      >
                        {weekdays.map((day) => (
                          <MenuItem key={day.value} value={day.value}>
                            <Checkbox
                              checked={
                                (
                                  formData.conditions?.timeRestrictions?.days ||
                                  []
                                ).indexOf(day.value) > -1
                              }
                            />
                            <ListItemText primary={day.label} />
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                </Box>
              )}
            </Box>

            {/* Additional Settings */}
            <Box mt={3} pt={3} borderTop="1px solid" borderColor="divider">
              <Typography variant="h6" fontWeight="medium" mb={3}>
                Additional Settings
              </Typography>

              <Box
                display="grid"
                gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }}
                gap={3}
              >
                <TextField
                  fullWidth
                  label="Priority"
                  name="priority"
                  type="number"
                  value={formData.priority || 10}
                  onChange={handleTextChange}
                  inputProps={{ min: 1, max: 100 }}
                  helperText={
                    blockAllWebsites
                      ? "Low priority (1) allows other rules to override this block-all rule"
                      : "Higher priority rules are applied first (1-100)"
                  }
                  disabled={isView}
                />

                <Box display="flex" alignItems="center">
                  <FormControlLabel
                    control={
                      <Switch
                        checked={
                          formData.isActive === undefined
                            ? true
                            : formData.isActive
                        }
                        onChange={handleSwitchChange}
                        name="isActive"
                        color="primary"
                        disabled={isView}
                      />
                    }
                    label="Rule is active"
                  />
                </Box>
              </Box>
            </Box>

            {/* Action Buttons */}
            <Box
              mt={4}
              pt={3}
              borderTop="1px solid"
              borderColor="divider"
              display="flex"
              justifyContent="space-between"
            >
              <Button variant="outlined" component={Link} to="/agent/rules">
                {isView ? "Back" : "Cancel"}
              </Button>

              {isView ? (
                <Button
                  variant="contained"
                  color="primary"
                  component={Link}
                  to={`/agent/rules/${id}/edit`}
                >
                  Edit Rule
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  startIcon={<SaveIcon />}
                  disabled={saving}
                >
                  {saving ? "Saving..." : isNew ? "Create Rule" : "Update Rule"}
                </Button>
              )}
            </Box>
          </Box>
        </form>
      </Paper>
    </MainLayout>
  );
};

export default AgentRuleForm;
