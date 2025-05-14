// src/pages/Agent/AgentRuleForm.tsx
import React, { useState, useEffect } from "react";
import MainLayout from "../../components/Layout/MainLayout";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Switch,
  TextField,
  Typography,
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

// Initialize a new empty rule
const emptyRule: Partial<AgentRule> = {
  name: "",
  description: "",
  type: AgentRuleType.BLOCK,
  resources: {
    websites: [],
    applications: [],
    files: [],
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
  const { id, action } = useParams<{ id: string; action: "view" | "edit" }>();
  const isNew = !id;
  const isView = viewOnly || action === "view";
  const [formData, setFormData] = useState<Partial<AgentRule>>(emptyRule);
  const [loading, setLoading] = useState<boolean>(!isNew);
  const [saving, setSaving] = useState<boolean>(false);
  const [users, setUsers] = useState<AgentUser[]>([]);
  const [newItem, setNewItem] = useState<{ [key: string]: string }>({
    website: "",
    application: "",
    file: "",
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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch users for selection
        const usersData = await AgentApi.getUsers();
        setUsers(usersData);

        // If editing or viewing, fetch rule data
        if (!isNew) {
          const ruleData = await AgentApi.getRuleById(id);
          if (ruleData) {
            setFormData(ruleData);
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>
  ) => {
    const { name, value, checked } = e.target as HTMLInputElement;

    if (!name) return;

    if (name === "isActive") {
      setFormData((prev) => ({ ...prev, isActive: checked }));
    } else if (name === "type") {
      setFormData((prev) => ({ ...prev, type: value as AgentRuleType }));
    } else if (name === "timeRestrictionsEnabled") {
      setFormData((prev) => ({
        ...prev,
        conditions: {
          ...prev.conditions,
          timeRestrictions: {
            ...prev.conditions?.timeRestrictions,
            enabled: checked,
          },
        },
      }));
    } else if (name === "startTime" || name === "endTime") {
      setFormData((prev) => ({
        ...prev,
        conditions: {
          ...prev.conditions,
          timeRestrictions: {
            ...prev.conditions?.timeRestrictions,
            [name]: value,
          },
        },
      }));
    } else if (name === "days") {
      setFormData((prev) => ({
        ...prev,
        conditions: {
          ...prev.conditions,
          timeRestrictions: {
            ...prev.conditions?.timeRestrictions,
            days: value as number[],
          },
        },
      }));
    } else if (name.includes(".")) {
      // Handle nested properties like "appliesTo.users"
      const [parent, child] = name.split(".");
      setFormData((prev) => ({
        ...prev,
        [parent]: {
          ...prev[parent as keyof AgentRule],
          [child]: value,
        },
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleNewItemChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    type: "website" | "application" | "file"
  ) => {
    setNewItem((prev) => ({ ...prev, [type]: e.target.value }));
  };

  const handleAddItem = (type: "websites" | "applications" | "files") => {
    const itemKey =
      type === "websites"
        ? "website"
        : type === "applications"
        ? "application"
        : "file";
    const itemValue = newItem[itemKey].trim();

    if (!itemValue) return;

    setFormData((prev) => ({
      ...prev,
      resources: {
        ...prev.resources,
        [type]: [...(prev.resources?.[type] || []), itemValue],
      },
    }));

    setNewItem((prev) => ({ ...prev, [itemKey]: "" }));
  };

  const handleRemoveItem = (
    type: "websites" | "applications" | "files",
    index: number
  ) => {
    setFormData((prev) => ({
      ...prev,
      resources: {
        ...prev.resources,
        [type]: prev.resources?.[type]?.filter((_, i) => i !== index) || [],
      },
    }));
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
        result = await AgentApi.updateRule(id, formData);
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
        <Box className="flex justify-center items-center h-64">
          <CircularProgress />
        </Box>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Box className="flex items-center mb-6">
        <Button
          component={Link}
          to="/agent/rules"
          startIcon={<ArrowBackIcon />}
          className="mr-4"
        >
          Back to Rules
        </Button>
        <Typography variant="h4" className="font-bold text-gray-800">
          {isView ? "View Rule" : isNew ? "Create New Rule" : "Edit Rule"}
        </Typography>
      </Box>

      <Paper className="p-6">
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Basic Information */}
            <Grid item xs={12}>
              <Typography variant="h6" className="font-medium mb-3">
                Basic Information
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Rule Name"
                name="name"
                value={formData.name || ""}
                onChange={handleChange}
                required
                disabled={isView}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={isView}>
                <InputLabel>Rule Type</InputLabel>
                <Select
                  name="type"
                  value={formData.type || AgentRuleType.BLOCK}
                  onChange={handleChange as any}
                  label="Rule Type"
                >
                  <MenuItem value={AgentRuleType.ALLOW}>Allow</MenuItem>
                  <MenuItem value={AgentRuleType.BLOCK}>Block</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                name="description"
                value={formData.description || ""}
                onChange={handleChange}
                multiline
                rows={2}
                disabled={isView}
              />
            </Grid>

            {/* Resources */}
            <Grid item xs={12}>
              <Typography
                variant="h6"
                className="font-medium mb-3 pt-3 border-t border-gray-200"
              >
                Resources
              </Typography>
              <Typography variant="body2" className="text-gray-500 mb-3">
                Specify the resources this rule applies to (websites,
                applications, files)
              </Typography>
            </Grid>

            {/* Websites */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" className="font-medium mb-2">
                Websites
              </Typography>
              <Box className="flex flex-wrap gap-1 mb-3">
                {formData.resources?.websites?.map((website, index) => (
                  <Chip
                    key={index}
                    label={website}
                    onDelete={
                      isView
                        ? undefined
                        : () => handleRemoveItem("websites", index)
                    }
                    color="primary"
                    variant="outlined"
                  />
                ))}
                {!formData.resources?.websites?.length && (
                  <Typography variant="body2" className="text-gray-500">
                    No websites added yet
                  </Typography>
                )}
              </Box>

              {!isView && (
                <Box className="flex gap-2 mb-3">
                  <TextField
                    size="small"
                    label="Add Website"
                    placeholder="example.com"
                    value={newItem.website}
                    onChange={(e) => handleNewItemChange(e, "website")}
                    className="flex-grow"
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
            </Grid>

            {/* Applications */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" className="font-medium mb-2">
                Applications
              </Typography>
              <Box className="flex flex-wrap gap-1 mb-3">
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
                  <Typography variant="body2" className="text-gray-500">
                    No applications added yet
                  </Typography>
                )}
              </Box>

              {!isView && (
                <Box className="flex gap-2 mb-3">
                  <TextField
                    size="small"
                    label="Add Application"
                    placeholder="chrome.exe"
                    value={newItem.application}
                    onChange={(e) => handleNewItemChange(e, "application")}
                    className="flex-grow"
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
            </Grid>

            {/* Files/Directories */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" className="font-medium mb-2">
                Files/Directories
              </Typography>
              <Box className="flex flex-wrap gap-1 mb-3">
                {formData.resources?.files?.map((file, index) => (
                  <Chip
                    key={index}
                    label={file}
                    onDelete={
                      isView
                        ? undefined
                        : () => handleRemoveItem("files", index)
                    }
                    color="info"
                    variant="outlined"
                  />
                ))}
                {!formData.resources?.files?.length && (
                  <Typography variant="body2" className="text-gray-500">
                    No files or directories added yet
                  </Typography>
                )}
              </Box>

              {!isView && (
                <Box className="flex gap-2 mb-3">
                  <TextField
                    size="small"
                    label="Add File/Directory"
                    placeholder="C:\Path\To\File.txt"
                    value={newItem.file}
                    onChange={(e) => handleNewItemChange(e, "file")}
                    className="flex-grow"
                  />
                  <Button
                    variant="outlined"
                    onClick={() => handleAddItem("files")}
                    disabled={!newItem.file.trim()}
                  >
                    Add
                  </Button>
                </Box>
              )}
            </Grid>

            {/* Rule Applies To */}
            <Grid item xs={12}>
              <Typography
                variant="h6"
                className="font-medium mb-3 pt-3 border-t border-gray-200"
              >
                Rule Applies To
              </Typography>
              <Typography variant="body2" className="text-gray-500 mb-3">
                Specify which users, departments, or roles this rule applies to
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth disabled={isView} className="mb-3">
                <InputLabel>Users</InputLabel>
                <Select
                  multiple
                  name="appliesTo.users"
                  value={formData.appliesTo?.users || []}
                  onChange={handleChange as any}
                  input={<OutlinedInput label="Users" />}
                  renderValue={(selected) => (
                    <Box className="flex flex-wrap gap-1">
                      {selected.map((userId) => {
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
                          (formData.appliesTo?.users || []).indexOf(user._id) >
                          -1
                        }
                      />
                      <ListItemText
                        primary={`${user.firstName} ${user.lastName} (${user.email})`}
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={isView} className="mb-3">
                <InputLabel>Departments</InputLabel>
                <Select
                  multiple
                  name="appliesTo.departments"
                  value={formData.appliesTo?.departments || []}
                  onChange={handleChange as any}
                  input={<OutlinedInput label="Departments" />}
                  renderValue={(selected) => (
                    <Box className="flex flex-wrap gap-1">
                      {selected.map((dept) => (
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
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={isView} className="mb-3">
                <InputLabel>Roles</InputLabel>
                <Select
                  multiple
                  name="appliesTo.roles"
                  value={formData.appliesTo?.roles || []}
                  onChange={handleChange as any}
                  input={<OutlinedInput label="Roles" />}
                  renderValue={(selected) => (
                    <Box className="flex flex-wrap gap-1">
                      {selected.map((role) => (
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
            </Grid>

            {/* Time Restrictions */}
            <Grid item xs={12}>
              <Typography
                variant="h6"
                className="font-medium mb-3 pt-3 border-t border-gray-200"
              >
                Time Restrictions
              </Typography>
              <Typography variant="body2" className="text-gray-500 mb-3">
                Optionally restrict when this rule is active
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={
                      formData.conditions?.timeRestrictions?.enabled || false
                    }
                    onChange={handleChange}
                    name="timeRestrictionsEnabled"
                    color="primary"
                    disabled={isView}
                  />
                }
                label="Enable time restrictions"
              />
            </Grid>

            {formData.conditions?.timeRestrictions?.enabled && (
              <>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Start Time"
                    type="time"
                    name="startTime"
                    value={
                      formData.conditions?.timeRestrictions?.startTime ||
                      "09:00"
                    }
                    onChange={handleChange}
                    InputLabelProps={{ shrink: true }}
                    disabled={isView}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="End Time"
                    type="time"
                    name="endTime"
                    value={
                      formData.conditions?.timeRestrictions?.endTime || "17:00"
                    }
                    onChange={handleChange}
                    InputLabelProps={{ shrink: true }}
                    disabled={isView}
                  />
                </Grid>
                <Grid item xs={12}>
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
                      onChange={handleChange as any}
                      input={<OutlinedInput label="Days of Week" />}
                      renderValue={(selected) => (
                        <Box className="flex flex-wrap gap-1">
                          {selected.map((day) => (
                            <Chip
                              key={day}
                              label={
                                weekdays.find((d) => d.value === day)?.label ||
                                day
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
                </Grid>
              </>
            )}

            {/* Additional Settings */}
            <Grid item xs={12}>
              <Typography
                variant="h6"
                className="font-medium mb-3 pt-3 border-t border-gray-200"
              >
                Additional Settings
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Priority"
                name="priority"
                type="number"
                value={formData.priority || 10}
                onChange={handleChange}
                InputProps={{ inputProps: { min: 1, max: 100 } }}
                helperText="Higher priority rules are applied first (1-100)"
                disabled={isView}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.isActive}
                    onChange={handleChange}
                    name="isActive"
                    color="primary"
                    disabled={isView}
                  />
                }
                label="Rule is active"
              />
            </Grid>

            {/* Action Buttons */}
            <Grid item xs={12} className="pt-3 border-t border-gray-200">
              <Box className="flex justify-between">
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
                    {saving
                      ? "Saving..."
                      : isNew
                      ? "Create Rule"
                      : "Update Rule"}
                  </Button>
                )}
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </MainLayout>
  );
};

export default AgentRuleForm;
